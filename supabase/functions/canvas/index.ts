// This Supabase Edge Function is the security boundary between the browser,
// Supabase, and Canvas. It authenticates Moofie users, encrypts Canvas tokens,
// and returns only the course data the frontend needs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isExcludedCourse, numericScore, submissionScore } from "../_shared/gradeData.js";

// Restrict browser requests to the configured local and production sites.
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const rateLimits: Record<string, { windowSeconds: number; maxRequests: number }> = {
  dashboard: { windowSeconds: 60, maxRequests: 10 },
  connect: { windowSeconds: 3600, maxRequests: 5 },
  disconnect: { windowSeconds: 3600, maxRequests: 5 },
  delete_account: { windowSeconds: 3600, maxRequests: 3 },
  push_config: { windowSeconds: 60, maxRequests: 10 },
  subscribe_push: { windowSeconds: 3600, maxRequests: 10 },
  unsubscribe_push: { windowSeconds: 3600, maxRequests: 10 },
};

function originAllowed(request: Request) {
  const origin = request.headers.get("Origin");
  return !origin || allowedOrigins.includes(origin);
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin":
      origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

// Canvas tokens are encrypted before they are stored in Supabase.
function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const encoded = requiredEnv("TOKEN_ENCRYPTION_KEY");
  const raw = base64ToBytes(encoded);
  if (raw.byteLength !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes.");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(token),
  );
  return {
    encryptedToken: bytesToBase64(new Uint8Array(encrypted)),
    tokenIv: bytesToBase64(iv),
  };
}

async function decryptToken(encryptedToken: string, tokenIv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(tokenIv) },
    await encryptionKey(),
    base64ToBytes(encryptedToken),
  );
  return new TextDecoder().decode(decrypted);
}

function normalizeCanvasUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("Canvas URL must use HTTPS.");
  if (url.hostname !== "catcourses.ucmerced.edu") {
    throw new Error("Moofie currently supports UC Merced CatCourses only.");
  }
  return url.origin;
}

// Follow Canvas pagination while preventing redirects to another origin.
function nextPageUrl(linkHeader: string | null) {
  if (!linkHeader) return null;
  const part = linkHeader.split(",").find((item) => item.includes('rel="next"'));
  return part?.match(/<([^>]+)>/)?.[1] ?? null;
}

async function canvasRequest(canvasUrl: string, pathOrUrl: string, token: string) {
  const requestUrl = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${canvasUrl}${pathOrUrl}`;
  const parsed = new URL(requestUrl);
  if (parsed.origin !== canvasUrl) {
    throw new Error("Canvas returned an invalid pagination URL.");
  }

  let response: Response;
  for (let attempt = 0; ; attempt++) {
    response = await fetch(parsed, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (attempt >= 1 || ![429, 500, 502, 503, 504].includes(response.status)) break;
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 500));
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error("Canvas rejected this token.");
    throw new Error(`Canvas request failed (${response.status}).`);
  }
  return {
    data: await response.json(),
    next: nextPageUrl(response.headers.get("Link")),
  };
}

async function canvasList(canvasUrl: string, path: string, token: string) {
  const items = [];
  let next: string | null = path;
  let pages = 0;
  while (next && pages < 50) {
    const page = await canvasRequest(canvasUrl, next, token);
    items.push(...page.data);
    next = page.next;
    pages += 1;
  }
  if (next) throw new Error("Canvas returned too many pages.");
  return items;
}

function safeLink(value: unknown, baseUrl?: string) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function gradeLetter(score: number | null) {
  if (score == null) return "—";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 65) return "D";
  return "F";
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const details = error as Record<string, unknown>;
    const parts = [details.message, details.details, details.hint, details.code]
      .filter((value) => typeof value === "string" && value.trim())
      .map(String);
    if (parts.length) return parts.join(" — ");
  }
  return "Unexpected server error.";
}

function mapAssignment(
  assignment: any,
  courseId: number,
  groupId: number,
  groupWeight: number,
  groupPosition = 0,
) {
  const submission = assignment.submission ?? null;
  const earned = submissionScore(submission);
  const externalToolUrl = safeLink(assignment.external_tool_tag_attributes?.url);
  return {
    id: assignment.id,
    courseId,
    groupId,
    groupWeight,
    groupPosition,
    position: Number(assignment.position ?? 0),
    title: assignment.name,
    quizId: assignment.quiz_id ?? null,
    isQuizAssignment: Boolean(assignment.is_quiz_assignment || assignment.quiz_id),
    description: assignment.description || "",
    submissionTypes: Array.isArray(assignment.submission_types)
      ? assignment.submission_types
      : [],
    allowedExtensions: Array.isArray(assignment.allowed_extensions)
      ? assignment.allowed_extensions
      : [],
    locked: Boolean(assignment.locked_for_user),
    lockAt: assignment.lock_at || null,
    unlockAt: assignment.unlock_at || null,
    dueAt: assignment.due_at,
    updatedAt: assignment.updated_at ?? null,
    points: Number(assignment.points_possible ?? 0),
    earned,
    grade: submission?.grade ?? null,
    graded: earned !== null,
    gradedAt: submission?.graded_at ?? null,
    gradedAnonymously: Boolean(assignment.anonymous_grading),
    submitted: Boolean(submission?.submitted_at),
    missing: Boolean(submission?.missing),
    late: Boolean(submission?.late),
    excused: Boolean(submission?.excused),
    omitted: Boolean(assignment.omit_from_final_grade),
    submission: submission
      ? {
          comments: Array.isArray(submission.submission_comments) ? submission.submission_comments.map((comment: any) => ({
            id: comment.id,
            author: comment.author_name || "Comment",
            text: comment.comment || "",
            createdAt: comment.created_at || null,
          })) : null,
          history: (submission.submission_history || []).map((attempt: any) => ({
            attempt: attempt.attempt,
            submittedAt: attempt.submitted_at || null,
            grade: attempt.grade ?? null,
            score: attempt.score ?? null,
            workflowState: attempt.workflow_state || null,
          })),
          attempt: Number(submission.attempt || 0),
          submittedAt: submission.submitted_at || null,
          workflowState: submission.workflow_state || null,
          score: earned,
          grade: submission.grade ?? null,
          gradedAt: submission.graded_at || null,
          body: submission.body || null,
          url: safeLink(submission.url),
          attachments: (submission.attachments || []).map((file: any) => ({
            id: file.id,
            name: file.display_name || file.filename || "Submitted file",
            size: Number(file.size || 0),
            contentType: file["content-type"] || null,
          })),
        }
      : null,
    externalToolUrl,
    externalToolNewTab: Boolean(assignment.external_tool_tag_attributes?.new_tab),
    htmlUrl: assignment.html_url,
  };
}

// Combine Canvas courses, groups, assignments, and submissions for the client.
async function dashboard(canvasUrl: string, token: string) {
  const [profile, rawCourses] = await Promise.all([
    canvasRequest(canvasUrl, "/api/v1/users/self/profile", token),
    canvasList(
      canvasUrl,
      "/api/v1/courses?enrollment_state=active&include[]=total_scores&include[]=teachers&per_page=100",
      token,
    ),
  ]);
  const usable = rawCourses.filter(
    (course: any) => {
      return (
        course.workflow_state === "available" &&
        !course.access_restricted_by_date &&
        !isExcludedCourse(course)
      );
    },
  );

  const courses = await Promise.all(
    usable.map(async (course: any) => {
      const rawGroups = await canvasList(
        canvasUrl,
        `/api/v1/courses/${course.id}/assignment_groups` +
          "?include[]=assignments&include[]=submission" +
          "&exclude_assignment_submission_types[]=wiki_page&per_page=100",
        token,
      );
      const groups = rawGroups.map((group: any) => ({
        id: group.id,
        name: group.name,
        weight: Number(group.group_weight ?? 0),
        rules: {
          dropLowest: Number(group.rules?.drop_lowest ?? 0),
          dropHighest: Number(group.rules?.drop_highest ?? 0),
          neverDrop: Array.isArray(group.rules?.never_drop)
            ? group.rules.never_drop
            : [],
        },
        assignments: (group.assignments ?? []).map((assignment: any) =>
          mapAssignment(
            assignment,
            course.id,
            group.id,
            Number(group.group_weight ?? 0),
            Number(group.position ?? 0),
          ),
        ),
      }));
      const enrollment =
        course.enrollments?.find(
          (item: any) =>
            item.type === "student" || item.type === "StudentEnrollment",
        ) ?? course.enrollments?.[0];
      // Final scores include ungraded assignments as zero; they are not a
      // substitute for the student's current grade.
      const rawGrade = numericScore(enrollment?.computed_current_score);
      const assignments = groups.flatMap((group: any) => group.assignments);
      const hasGradedAssignment = assignments.some(
        (assignment: any) =>
          assignment.earned !== null &&
          assignment.earned !== undefined &&
          !assignment.omitted &&
          !assignment.excused,
      );
      const grade =
        hasGradedAssignment ? rawGrade : null;

      return {
        id: course.id,
        code: course.course_code || course.name,
        name: course.name,
        updatedAt: course.updated_at ?? null,
        instructor:
          course.teachers
            ?.map((teacher: any) => teacher.display_name)
            .join(", ") || "Instructor not listed",
        grade,
        letter: hasGradedAssignment && grade !== null
          ? String(
              enrollment?.computed_current_grade ||
                gradeLetter(grade),
            ).replace(/^A\+$/i, "A")
          : null,
        weighted: Boolean(course.apply_assignment_group_weights),
        groups,
        assignments,
      };
    }),
  );
  return { profile: profile.data, courses, _sync: { source: "Canvas", checkedAt: new Date().toISOString() } };
}

// Authenticate every request before handling a Canvas or account action.
Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  const respond = (body: unknown, status = 200) => json(body, status, headers);
  let stage = "starting request";

  if (!originAllowed(request)) {
    return respond({ error: "Origin not allowed." }, 403);
  }
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  try {
    stage = "reading Supabase environment";
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    stage = "reading request body";
    const body = await request.json();

    let user = null;
    const authorization = request.headers.get("Authorization");
    if (authorization) {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
      });
      const { data, error: authError } = await authClient.auth.getUser();
      if (!authError) user = data.user;
    }

    if (!user) return respond({ error: "Sign in required." }, 401);

    const rateLimit = rateLimits[body.action];
    if (!rateLimit) return respond({ error: "Unknown action." }, 400);

    stage = "checking rate limit";
    const { data: requestAllowed, error: rateLimitError } = await admin.rpc(
      "check_edge_rate_limit",
      {
        p_user_id: user.id,
        p_action: body.action,
        p_window_seconds: rateLimit.windowSeconds,
        p_max_requests: rateLimit.maxRequests,
      },
    );
    if (rateLimitError) throw rateLimitError;
    if (!requestAllowed) {
      return respond(
        { error: "Too many requests. Please wait and try again." },
        429,
      );
    }

    if (body.action === "connect") {
      const canvasUrl = normalizeCanvasUrl(body.canvasUrl || "");
      const token = String(body.token || "").trim();
      if (!token) return respond({ error: "Enter a Canvas access token." }, 400);
      if (token.length > 4096) {
        return respond({ error: "Canvas token is too long." }, 400);
      }
      const data = await dashboard(canvasUrl, token);
      const encrypted = await encryptToken(token);
      const { error } = await admin.from("canvas_connections").upsert({
        user_id: user.id,
        canvas_url: canvasUrl,
        encrypted_token: encrypted.encryptedToken,
        token_iv: encrypted.tokenIv,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return respond(data);
    }

    if (body.action === "disconnect") {
      const { error } = await admin
        .from("canvas_connections")
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
      return respond({ disconnected: true });
    }

    if (body.action === "push_config") {
      return respond({ publicKey: requiredEnv("VAPID_PUBLIC_KEY") });
    }

    if (body.action === "subscribe_push") {
      const subscription = body.subscription;
      const endpoint = String(subscription?.endpoint || "").trim();
      const p256dh = String(subscription?.keys?.p256dh || "").trim();
      const auth = String(subscription?.keys?.auth || "").trim();
      if (!endpoint || !p256dh || !auth) {
        return respond({ error: "Invalid push subscription." }, 400);
      }
      const endpointUrl = new URL(endpoint);
      if (endpointUrl.protocol !== "https:" || endpoint.length > 4096) {
        return respond({ error: "Invalid push endpoint." }, 400);
      }
      if (p256dh.length > 512 || auth.length > 512) {
        return respond({ error: "Invalid push subscription keys." }, 400);
      }

      const { error } = await admin.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint,
          p256dh,
          auth,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      return respond({ subscribed: true });
    }

    if (body.action === "unsubscribe_push") {
      const endpoint = String(body.endpoint || "").trim();
      if (!endpoint || endpoint.length > 4096) {
        return respond({ error: "Invalid push endpoint." }, 400);
      }
      const { error } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);
      if (error) throw error;
      return respond({ unsubscribed: true });
    }

    if (body.action === "delete_account") {
      const { error: connectionError } = await admin
        .from("canvas_connections")
        .delete()
        .eq("user_id", user.id);
      if (connectionError) throw connectionError;

      const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
      if (deleteError) throw deleteError;
      return respond({ deleted: true });
    }

    if (body.action === "dashboard") {
      const { data: connection, error } = await admin
        .from("canvas_connections")
        .select("canvas_url, encrypted_token, token_iv")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!connection) return respond({ connected: false });
      const token = await decryptToken(
        connection.encrypted_token,
        connection.token_iv,
      );
      return respond(await dashboard(connection.canvas_url, token));
    }
    return respond({ error: "Unknown action." }, 400);
  } catch (error) {
    const cause = errorMessage(error);
    const message = cause === "Unexpected server error."
      ? `Request failed while ${stage}.`
      : cause;
    console.error("Canvas function failed", {
      stage,
      message,
      error: error && typeof error === "object" ? { ...error } : error,
    });
    return respond({ error: message }, 500);
  }
});
