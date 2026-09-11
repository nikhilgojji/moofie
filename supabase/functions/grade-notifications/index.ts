import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Connection = {
  user_id: string;
  canvas_url: string;
  encrypted_token: string;
  token_iv: string;
};

type GradeSnapshot = {
  user_id: string;
  course_id: number;
  assignment_id: number;
  course_name: string;
  assignment_title: string;
  score: number | null;
  points_possible: number;
  graded_at: string | null;
  html_url: string | null;
  updated_at: string;
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const raw = base64ToBytes(requiredEnv("TOKEN_ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes.");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
}

async function decryptToken(encryptedToken: string, tokenIv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(tokenIv) },
    await encryptionKey(),
    base64ToBytes(encryptedToken),
  );
  return new TextDecoder().decode(decrypted);
}

function nextPageUrl(linkHeader: string | null) {
  if (!linkHeader) return null;
  const part = linkHeader.split(",").find((item) => item.includes('rel="next"'));
  return part?.match(/<([^>]+)>/)?.[1] ?? null;
}

async function canvasList(canvasUrl: string, path: string, token: string) {
  const items: any[] = [];
  let next: string | null = path;
  let pages = 0;

  while (next && pages < 50) {
    const url = new URL(next.startsWith("http") ? next : `${canvasUrl}${next}`);
    if (url.origin !== canvasUrl) throw new Error("Invalid Canvas pagination URL.");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Canvas request failed (${response.status}).`);
    items.push(...await response.json());
    next = nextPageUrl(response.headers.get("Link"));
    pages += 1;
  }

  if (next) throw new Error("Canvas returned too many pages.");
  return items;
}

async function getCurrentGrades(connection: Connection, token: string) {
  const courses = await canvasList(
    connection.canvas_url,
    "/api/v1/courses?enrollment_state=active&per_page=100",
    token,
  );
  const usable = courses.filter(
    (course) => {
      const name = String(course.name ?? "").trim();
      return (
        course.workflow_state === "available" &&
        !course.access_restricted_by_date &&
        !/^(placement exam:|shape student training\b)/i.test(name) &&
        !/academic success/i.test(name) &&
        !/^(?:[A-Z]\d{2}-)?CSE\s*001(?:\s+\d{2})?$/i.test(name)
      );
    },
  );

  const snapshots = await Promise.all(
    usable.map(async (course) => {
      const groups = await canvasList(
        connection.canvas_url,
        `/api/v1/courses/${course.id}/assignment_groups` +
          "?include[]=assignments&include[]=submission" +
          "&exclude_assignment_submission_types[]=wiki_page&per_page=100",
        token,
      );

      return groups.flatMap((group) =>
        (group.assignments || [])
          .filter(
            (assignment) =>
              assignment.submission?.score !== null &&
              assignment.submission?.score !== undefined,
          )
          .map((assignment): GradeSnapshot => ({
            user_id: connection.user_id,
            course_id: Number(course.id),
            assignment_id: Number(assignment.id),
            course_name: String(course.name || course.course_code || "Course"),
            assignment_title: String(assignment.name || "Assignment"),
            score: Number(assignment.submission.score),
            points_possible: Number(assignment.points_possible || 0),
            graded_at: assignment.submission.graded_at || null,
            html_url: assignment.html_url || null,
            updated_at: new Date().toISOString(),
          })),
      );
    }),
  );

  return snapshots.flat();
}

function gradeChanged(previous: any, current: GradeSnapshot) {
  if (!previous) return true;
  return (
    Number(previous.score) !== Number(current.score) ||
    (previous.graded_at || null) !== (current.graded_at || null)
  );
}

function notificationFor(changes: GradeSnapshot[]) {
  if (changes.length === 1) {
    const grade = changes[0];
    const points = grade.points_possible
      ? `${grade.score} / ${grade.points_possible} pts`
      : `${grade.score} pts`;
    return {
      title: `${grade.assignment_title} was graded`,
      body: `${grade.course_name} · ${points}`,
      tag: `grade-${grade.course_id}-${grade.assignment_id}`,
      url: "/",
    };
  }
  return {
    title: `${changes.length} grade updates`,
    body: `New or changed grades are ready in Moofie.`,
    tag: "moofie-grade-updates",
    url: "/",
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: authorized, error: authError } = await admin.rpc(
    "verify_push_cron_secret",
    { p_secret: request.headers.get("x-cron-secret") || "" },
  );
  if (authError || !authorized) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  webpush.setVapidDetails(
    requiredEnv("VAPID_SUBJECT"),
    requiredEnv("VAPID_PUBLIC_KEY"),
    requiredEnv("VAPID_PRIVATE_KEY"),
  );

  const { data: connections, error: connectionsError } = await admin
    .from("canvas_connections")
    .select("user_id, canvas_url, encrypted_token, token_iv")
    .order("updated_at", { ascending: true })
    .limit(100);
  if (connectionsError) throw connectionsError;

  let usersChecked = 0;
  let notificationsSent = 0;
  const failures: Array<{ userId: string; error: string }> = [];

  for (const connection of (connections || []) as Connection[]) {
    try {
      const token = await decryptToken(connection.encrypted_token, connection.token_iv);
      const current = await getCurrentGrades(connection, token);
      const [{ data: previous }, { data: priorRun }] = await Promise.all([
        admin
          .from("grade_notification_state")
          .select("course_id, assignment_id, score, graded_at")
          .eq("user_id", connection.user_id),
        admin
          .from("grade_notification_runs")
          .select("last_checked_at")
          .eq("user_id", connection.user_id)
          .maybeSingle(),
      ]);
      const previousById = new Map(
        (previous || []).map((grade) => [
          `${grade.course_id}-${grade.assignment_id}`,
          grade,
        ]),
      );
      const changes = priorRun
        ? current.filter((grade) =>
            gradeChanged(
              previousById.get(`${grade.course_id}-${grade.assignment_id}`),
              grade,
            ),
          )
        : [];

      if (current.length) {
        const { error } = await admin
          .from("grade_notification_state")
          .upsert(current, { onConflict: "user_id,course_id,assignment_id" });
        if (error) throw error;
      }
      const { error: runError } = await admin
        .from("grade_notification_runs")
        .upsert({ user_id: connection.user_id, last_checked_at: new Date().toISOString() });
      if (runError) throw runError;

      if (changes.length) {
        const { data: subscriptions, error } = await admin
          .from("push_subscriptions")
          .select("endpoint, p256dh, auth")
          .eq("user_id", connection.user_id);
        if (error) throw error;
        const payload = JSON.stringify(notificationFor(changes));

        for (const subscription of subscriptions || []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              payload,
              { TTL: 3600 },
            );
            notificationsSent += 1;
          } catch (error) {
            const statusCode = Number((error as any)?.statusCode || 0);
            if (statusCode === 404 || statusCode === 410) {
              await admin
                .from("push_subscriptions")
                .delete()
                .eq("endpoint", subscription.endpoint);
            } else {
              throw error;
            }
          }
        }
      }
      usersChecked += 1;
    } catch (error) {
      failures.push({
        userId: connection.user_id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return Response.json({ usersChecked, notificationsSent, failures });
});
