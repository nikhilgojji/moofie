import { compareCanvasCollections, compareCanvasCourse, resourceSection } from "./courseAudit.ts";
import { loadFilePreview } from "./filePreview.ts";
import { mapCoursePerson, loadCoursePerson } from "./coursePeople.ts";
import { completeModules, moduleExternalUrl } from "./courseModules.ts";
import { readToolContent } from "./toolContent.ts";
// This Supabase Edge Function is the security boundary between the browser,
// Supabase, and Canvas. It authenticates Moofie users, encrypts Canvas tokens,
// and returns only the course data the frontend needs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Restrict browser requests to the configured local and production sites.
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const rateLimits: Record<string, { windowSeconds: number; maxRequests: number }> = {
  dashboard: { windowSeconds: 60, maxRequests: 10 },
  course_resources: { windowSeconds: 60, maxRequests: 20 },
  course_tool: { windowSeconds: 60, maxRequests: 20 },
  course_page: { windowSeconds: 60, maxRequests: 30 },
  course_content: { windowSeconds: 60, maxRequests: 30 },
  course_file: { windowSeconds: 60, maxRequests: 30 },
  assignment_details: { windowSeconds: 60, maxRequests: 30 },
  submit_assignment: { windowSeconds: 60, maxRequests: 6 },
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

async function canvasMutation(
  canvasUrl: string,
  path: string,
  token: string,
  body: URLSearchParams,
) {
  const parsed = new URL(path, canvasUrl);
  if (parsed.origin !== canvasUrl) throw new Error("Invalid Canvas request URL.");
  const response = await fetch(parsed, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Canvas rejected this token.");
    const details = await response.text();
    console.error("Canvas mutation failed", response.status, details.slice(0, 500));
    throw new Error(`Canvas rejected the submission (${response.status}).`);
  }
  return await response.json();
}

async function optionalCanvasList(
  canvasUrl: string,
  path: string,
  token: string,
  report?: (status: string) => void,
) {
  try {
    const result = await canvasList(canvasUrl, path, token);
    report?.("current");
    return result;
  } catch (error) {
    const message = errorMessage(error);
    if (/Canvas request failed \((403|404)\)/.test(message)) { report?.(message.includes("403") ? "restricted" : "unavailable"); return []; }
    if (report && !/token|401/i.test(message)) { report("error"); return []; }
    throw error;
  }
}

async function optionalCanvasRequest(
  canvasUrl: string,
  path: string,
  token: string,
  report?: (status: string) => void,
) {
  try {
    const result = (await canvasRequest(canvasUrl, path, token)).data;
    report?.("current");
    return result;
  } catch (error) {
    const message = errorMessage(error);
    if (/Canvas request failed \((403|404)\)/.test(message)) { report?.(message.includes("403") ? "restricted" : "unavailable"); return null; }
    if (report && !/token|401/i.test(message)) { report("error"); return null; }
    throw error;
  }
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

async function courseFile(
  canvasUrl: string,
  token: string,
  fileId: number,
) {
  const metadata = (
    await canvasRequest(canvasUrl, `/api/v1/files/${fileId}`, token)
  ).data;
  if (metadata.locked_for_user || metadata.hidden_for_user) {
    throw new Error("This file is currently locked in Canvas.");
  }

  const downloadUrl = new URL(String(metadata.url || ""), canvasUrl);
  if (downloadUrl.origin !== canvasUrl || downloadUrl.protocol !== "https:") {
    throw new Error("Canvas returned an unsafe file URL.");
  }
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}`, Accept: "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Canvas could not load this file (${response.status}).`);
  }

  return {
    body: response.body,
    contentType:
      metadata["content-type"] ||
      response.headers.get("Content-Type") ||
      "application/octet-stream",
    name: String(metadata.display_name || metadata.filename || "course-file")
      .replace(/[\r\n"]/g, "")
      .slice(0, 255),
  };
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
  const externalToolUrl = safeLink(assignment.external_tool_tag_attributes?.url);
  return {
    id: assignment.id,
    courseId,
    groupId,
    groupWeight,
    groupPosition,
    position: Number(assignment.position ?? 0),
    title: assignment.name,
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
    earned: submission?.score ?? null,
    grade: submission?.grade ?? null,
    graded: submission?.workflow_state === "graded" || submission?.score != null,
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
          score: submission.score ?? null,
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
      compareCanvasCollections({ groups: rawGroups }, { groups });
      for (let i = 0; i < rawGroups.length; i++) compareCanvasCollections({ assignments: rawGroups[i].assignments || [] }, { assignments: groups[i].assignments });
      const enrollment =
        course.enrollments?.find(
          (item: any) =>
            item.type === "student" || item.type === "StudentEnrollment",
        ) ?? course.enrollments?.[0];
      const rawGrade =
        enrollment?.computed_current_score ??
        enrollment?.computed_final_score ??
        null;
      const assignments = groups.flatMap((group: any) => group.assignments);
      const hasGradedAssignment = assignments.some(
        (assignment: any) =>
          assignment.earned !== null &&
          assignment.earned !== undefined &&
          !assignment.omitted &&
          !assignment.excused,
      );
      const grade =
        hasGradedAssignment && rawGrade != null ? Number(rawGrade) : null;

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
        letter: hasGradedAssignment
          ? String(
              enrollment?.computed_current_grade ||
                enrollment?.computed_final_grade ||
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

async function courseResources(
  canvasUrl: string,
  token: string,
  courseId: number,
  includePeople = true,
) {
  const resourceStates: Record<string, string> = {};
  const readList = (url: string, path: string, credential: string) => optionalCanvasList(url, path, credential, status => { resourceStates[resourceSection(path)] = status; });
  const readObject = (url: string, path: string, credential: string) => optionalCanvasRequest(url, path, credential, status => { resourceStates[resourceSection(path)] = status; });
  const [
    course,
    frontPage,
    announcements,
    modules,
    files,
    pages,
    tabs,
    discussions,
    quizzes,
    people,
    folders,
    syllabusEvents,
    courseSettings,
    sections,
  ] = await Promise.all([
    readObject(
      canvasUrl,
      `/api/v1/courses/${courseId}?include[]=syllabus_body&include[]=term`,
      token,
    ),
    readObject(
      canvasUrl,
      `/api/v1/courses/${courseId}/front_page`,
      token,
    ),
    readList(
      canvasUrl,
      `/api/v1/announcements?context_codes[]=course_${courseId}` +
        "&active_only=true&latest_only=false&per_page=100",
      token,
    ),
    readList(
      canvasUrl,
      `/api/v1/courses/${courseId}/modules` +
        "?include[]=items&include[]=content_details&per_page=100",
      token,
    ),
    readList(
      canvasUrl,
      `/api/v1/courses/${courseId}/files?sort=updated_at&order=desc&per_page=100`,
      token,
    ),
    readList(
      canvasUrl,
      `/api/v1/courses/${courseId}/pages?published=true&sort=title&order=asc&per_page=100`,
      token,
    ),
    readList(
      canvasUrl,
      `/api/v1/courses/${courseId}/tabs?include[]=course_subject_tabs&per_page=100`,
      token,
    ),
    readList(
      canvasUrl,
      `/api/v1/courses/${courseId}/discussion_topics?only_announcements=false&per_page=100`,
      token,
    ),
    readList(
      canvasUrl,
      `/api/v1/courses/${courseId}/quizzes?per_page=100`,
      token,
    ),
    includePeople ? readList(
      canvasUrl,
      `/api/v1/courses/${courseId}/users` +
        "?include[]=enrollments&include[]=avatar_url&per_page=100",
      token,
    ) : Promise.resolve([]),
    readList(canvasUrl, `/api/v1/courses/${courseId}/folders?per_page=100`, token),
    readList(canvasUrl, `/api/v1/calendar_events?context_codes[]=course_${courseId}&type=event&all_events=true&per_page=100`, token),
    readObject(canvasUrl, `/api/v1/courses/${courseId}/settings`, token),
    includePeople ? readList(canvasUrl, `/api/v1/courses/${courseId}/sections?per_page=100`, token) : Promise.resolve([]),
  ]);

  if (!course) throw new Error("Canvas did not return this course. Please refresh to try again.");
  const [fullModules, activity] = await Promise.all([
    completeModules(modules, moduleId => canvasList(canvasUrl, "/api/v1/courses/" + courseId + "/modules/" + moduleId + "/items?include[]=content_details&per_page=100", token)).catch(error => { if (/token|401/i.test(errorMessage(error))) throw error; resourceStates.modules = "error"; return modules; }),
    course.default_view === "feed" ? canvasList(canvasUrl, "/api/v1/courses/" + courseId + "/activity_stream?per_page=100", token).catch(error => { if (/token|401/i.test(errorMessage(error))) throw error; resourceStates.activity = "error"; return []; }) : Promise.resolve([]),
  ]);
  const result = {
    courseId,
    activity: activity.map((item: any) => ({ id: item.id, type: item.type || "Activity", title: item.title || "Course activity", message: item.message || "", updatedAt: item.updated_at || item.created_at || null, read: Boolean(item.read_state), assignmentId: item.assignment_id || item.assignment?.id || null, discussionId: item.discussion_topic_id || null, announcementId: item.announcement_id || null, htmlUrl: safeLink(item.html_url, canvasUrl) })),
    course: {
      name: course?.name || null,
      code: course?.course_code || null,
      defaultView: course?.default_view || null,
      homeBody: frontPage?.body || "",
      hasFrontPage: Boolean(frontPage),
      homeTitle: frontPage?.title || null,
      showHomeAnnouncements: Boolean(courseSettings?.show_announcements_on_home_page),
      homeAnnouncementLimit: Number(courseSettings?.home_page_announcement_limit ?? 5),
      homePageUrl: safeLink(frontPage?.html_url),
      syllabusBody: course?.syllabus_body || "",
      homeUrl: safeLink(`${canvasUrl}/courses/${courseId}`),
    },
    syllabusEvents: syllabusEvents.map((event: any) => ({ id: event.id, title: event.title || "Course event", description: event.description || "", startAt: event.start_at || null })),
    announcements: announcements.map((announcement: any) => ({
      id: announcement.id,
      title: announcement.title || "Announcement",
      message: announcement.message || "",
      postedAt: announcement.posted_at || announcement.created_at || null,
      author: announcement.author?.display_name || null,
      authorAvatarUrl: safeLink(
        announcement.author?.avatar_image_url ||
          announcement.author?.avatar_url,
      ),
      htmlUrl: safeLink(announcement.html_url),
    })),
    modules: fullModules.map((module: any) => ({
      id: module.id,
      name: module.name || "Module",
      state: module.state || null,
      items: (module.items || []).map((item: any) => ({
        id: item.id,
        title: item.title || "Untitled item",
        type: item.type || "Item",
        indent: Number(item.indent || 0),
        completed: item.completion_requirement?.completed ?? null,
        locked: Boolean(item.content_details?.locked_for_user),
        dueAt: item.content_details?.due_at || null,
        points: item.content_details?.points_possible == null
          ? null
          : Number(item.content_details.points_possible),
        contentId: item.content_id || null,
        pageUrl: item.page_url || null,
        htmlUrl: safeLink(item.html_url),
        externalUrl: moduleExternalUrl(item.external_url, canvasUrl),
      })),
    })),
    folders: folders.map((folder: any) => ({
      id: folder.id,
      parentId: folder.parent_folder_id ?? null,
      name: folder.name || "Untitled folder",
      createdAt: folder.created_at || null,
      updatedAt: folder.updated_at || null,
      locked: Boolean(folder.locked_for_user || folder.hidden_for_user),
    })),
    files: files.map((file: any) => ({
      id: file.id,
      folderId: file.folder_id ?? null,
      createdAt: file.created_at || null,
      name: file.display_name || file.filename || "Untitled file",
      contentType: file["content-type"] || null,
      size: Number(file.size || 0),
      updatedAt: file.updated_at || file.created_at || null,
      locked: Boolean(file.locked_for_user || file.hidden_for_user),
      url: safeLink(file.url),
      previewUrl: safeLink(file.preview_url),
    })),
    pages: pages.map((page: any) => ({
      id: page.page_id || page.url,
      pageUrl: page.url,
      title: page.title || "Untitled page",
      updatedAt: page.updated_at || page.created_at || null,
      htmlUrl: safeLink(page.html_url),
    })),
    tabs: tabs
      .filter((tab: any) => !tab.hidden)
      .sort(
        (first: any, second: any) =>
          Number(first.position || 0) - Number(second.position || 0),
      )
      .map((tab: any) => ({
        id: tab.id,
        label: tab.label || tab.id || "Course tool",
        type: tab.type || null,
        htmlUrl: safeLink(tab.html_url, canvasUrl),
      }))
      .filter((tab: any) => tab.htmlUrl),
    discussions: discussions.filter((discussion: any) => !discussion.is_announcement).map((discussion: any) => ({
      isAnnouncement: false,
      closed: Boolean(discussion.locked),
      pinned: Boolean(discussion.pinned),
      lastReplyAt: discussion.last_reply_at || discussion.posted_at || null,
      id: discussion.id,
      title: discussion.title || "Discussion",
      message: discussion.message || "",
      postedAt: discussion.posted_at || discussion.created_at || null,
      authorName:
        discussion.author?.display_name || discussion.user_name || null,
      authorAvatarUrl: safeLink(
        discussion.author?.avatar_image_url ||
          discussion.author?.avatar_url,
      ),
      unreadCount: Number(discussion.unread_count || 0),
      locked: Boolean(discussion.locked_for_user),
      htmlUrl: safeLink(discussion.html_url),
    })),
    quizzes: quizzes.map((quiz: any) => ({
      id: quiz.id,
      title: quiz.title || "Quiz",
      description: quiz.description || "",
      dueAt: quiz.due_at || null,
      points: Number(quiz.points_possible || 0),
      quizType: quiz.quiz_type || null,
      questionCount: quiz.question_count ?? null,
      unlockAt: quiz.unlock_at || null,
      lockAt: quiz.lock_at || null,
      lockExplanation: quiz.lock_explanation || null,
      allowedAttempts: Number(quiz.allowed_attempts ?? 0),
      locked: Boolean(quiz.locked_for_user),
      htmlUrl: safeLink(quiz.html_url),
    })),
    people: includePeople ? people.map((person: any) => mapCoursePerson(person, sections, { ...course, id: courseId })) : null,

  };
  const checks = compareCanvasCollections({ announcements, modules: fullModules, files, folders, pages, quizzes,
    discussions: discussions.filter((item: any) => !item.is_announcement),
    tabs: tabs.filter((tab: any) => !tab.hidden && safeLink(tab.html_url, canvasUrl)).sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0)),
  }, result);
  checks.course = compareCanvasCourse(course, frontPage, result.course);
  for (let i = 0; i < fullModules.length; i++) compareCanvasCollections({ items: fullModules[i].items || [] }, result.modules[i]);
  if (Object.values(resourceStates).includes("error")) console.warn("canvas_read_partial", { sections: Object.entries(resourceStates).filter(([, status]) => status === "error").map(([name]) => name) });
  return { ...result, _sync: { checkedAt: new Date().toISOString(), source: "Canvas", sections: resourceStates,
    partial: Object.values(resourceStates).includes("error"), checks } };

}

async function coursePage(
  canvasUrl: string,
  token: string,
  courseId: number,
  pageUrl: string,
) {
  const page = await canvasRequest(
    canvasUrl,
    `/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`,
    token,
  );
  return {
    id: page.data.page_id || page.data.url,
    title: page.data.title || "Course page",
    body: page.data.body || "",
    updatedAt: page.data.updated_at || null,
    htmlUrl: safeLink(page.data.html_url),
  };
}

async function assignmentDetails(
  canvasUrl: string,
  token: string,
  courseId: number,
  assignmentId: number,
) {
  const response = await canvasRequest(
    canvasUrl,
    `/api/v1/courses/${courseId}/assignments/${assignmentId}?include[]=submission`,
    token,
  );
  const assignment = response.data;
  const fullSubmission = await optionalCanvasRequest(canvasUrl,
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self?include[]=submission_comments&include[]=submission_history`, token);
  if (fullSubmission) assignment.submission = fullSubmission;
  const mapped = mapAssignment(
    assignment,
    courseId,
    Number(assignment.assignment_group_id || 0),
    0,
  );
  if (!mapped.submissionTypes.includes("external_tool")) return mapped;

  const params = new URLSearchParams({ assignment_id: String(assignmentId) });
  if (mapped.externalToolUrl) params.set("url", mapped.externalToolUrl);
  const launch = await optionalCanvasRequest(
    canvasUrl,
    `/api/v1/courses/${courseId}/external_tools/sessionless_launch?${params.toString()}`,
    token,
  );
  return {
    ...mapped,
    externalLaunchUrl: safeLink(launch?.url) || mapped.externalToolUrl,
  };
}

async function uploadSubmissionFile(
  canvasUrl: string,
  token: string,
  courseId: number,
  assignmentId: number,
  file: Record<string, unknown>,
) {
  const name = String(file.name || "").trim();
  const contentType = String(file.contentType || "application/octet-stream");
  const base64 = String(file.base64 || "");
  if (!name || name.length > 255) throw new Error("Choose a valid file.");
  if (!base64 || base64.length > 27_000_000) {
    throw new Error("Files submitted through Moofie must be smaller than 20 MB.");
  }

  let bytes: Uint8Array;
  try {
    const decoded = atob(base64);
    bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Moofie could not read that file.");
  }
  if (bytes.byteLength > 20_000_000) {
    throw new Error("Files submitted through Moofie must be smaller than 20 MB.");
  }

  const initialize = new URLSearchParams({
    name,
    size: String(bytes.byteLength),
    content_type: contentType,
  });
  const upload = await canvasMutation(
    canvasUrl,
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self/files`,
    token,
    initialize,
  );
  const uploadUrl = new URL(String(upload.upload_url || ""));
  if (uploadUrl.protocol !== "https:") throw new Error("Canvas returned an unsafe upload URL.");

  const form = new FormData();
  Object.entries(upload.upload_params || {}).forEach(([key, value]) => {
    form.append(key, String(value));
  });
  form.append("file", new Blob([bytes], { type: contentType }), name);
  const response = await fetch(uploadUrl, {
    method: "POST",
    body: form,
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Canvas could not upload the file (${response.status}).`);
  const attachment = await response.json();
  const fileId = Number(Array.isArray(attachment) ? attachment[0]?.id : attachment.id);
  if (!Number.isSafeInteger(fileId) || fileId <= 0) {
    throw new Error("Canvas uploaded the file but did not return its ID.");
  }
  return fileId;
}

async function submitAssignment(
  canvasUrl: string,
  token: string,
  courseId: number,
  assignmentId: number,
  submission: Record<string, unknown>,
) {
  const type = String(submission.type || "");
  if (type !== "online_upload") {
    throw new Error("Moofie currently accepts file-upload assignments only.");
  }

  const details = await assignmentDetails(canvasUrl, token, courseId, assignmentId);
  const now = Date.now();
  const unlockTime = details.unlockAt ? new Date(details.unlockAt).getTime() : null;
  const lockTime = details.lockAt ? new Date(details.lockAt).getTime() : null;
  if (
    details.locked ||
    (Number.isFinite(unlockTime) && now < Number(unlockTime)) ||
    (Number.isFinite(lockTime) && now > Number(lockTime))
  ) {
    throw new Error("This assignment is currently locked in Canvas.");
  }
  if (!details.submissionTypes.includes("online_upload")) {
    throw new Error("This assignment does not accept file uploads.");
  }

  const params = new URLSearchParams({ "submission[submission_type]": type });
  const file = submission.file;
  if (!file || typeof file !== "object") throw new Error("Choose a file to submit.");
  const fileName = String((file as Record<string, unknown>).name || "");
  const extension = fileName.includes(".")
    ? fileName.split(".").pop()?.toLowerCase() || ""
    : "";
  if (
    details.allowedExtensions.length &&
    !details.allowedExtensions.map((value: string) => value.toLowerCase()).includes(extension)
  ) {
    throw new Error(`Canvas only accepts: ${details.allowedExtensions.join(", ")}.`);
  }
  const fileId = await uploadSubmissionFile(
    canvasUrl,
    token,
    courseId,
    assignmentId,
    file as Record<string, unknown>,
  );
  params.append("submission[file_ids][]", String(fileId));

  await canvasMutation(
    canvasUrl,
    `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
    token,
    params,
  );
  return await assignmentDetails(canvasUrl, token, courseId, assignmentId);
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
        p_action:
          body.action === "course_resources" ||
              body.action === "course_tool" || body.action === "course_content" || body.action === "course_page" ||
              body.action === "course_file" ||
              body.action === "assignment_details" ||
              body.action === "submit_assignment"
            ? "dashboard"
            : body.action,
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

    if (
      body.action === "dashboard" ||
      body.action === "course_resources" ||
      body.action === "course_tool" || body.action === "course_content" || body.action === "course_page" ||
      body.action === "course_file" ||
      body.action === "assignment_details" ||
      body.action === "submit_assignment"
    ) {
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
      if (body.action === "dashboard") {
        return respond(await dashboard(connection.canvas_url, token));
      }

      const courseId = Number(body.courseId);
      if (!Number.isSafeInteger(courseId) || courseId <= 0) {
        return respond({ error: "Choose a valid course." }, 400);
      }
      if (body.action === "course_resources") {
        if (body.part === "people") {
          const [course, people, sections] = await Promise.all([
            canvasRequest(connection.canvas_url, `/api/v1/courses/${courseId}`, token),
            canvasList(connection.canvas_url, `/api/v1/courses/${courseId}/users?include[]=enrollments&include[]=avatar_url&per_page=100`, token),
            optionalCanvasList(connection.canvas_url, `/api/v1/courses/${courseId}/sections?per_page=100`, token),
          ]);
          return respond({ people: people.map((person: any) => mapCoursePerson(person, sections, course.data)) });
        }
        return respond(
          await courseResources(connection.canvas_url, token, courseId, body.includePeople !== false),
        );
      }

      if (body.action === "course_content") {
        const contentId = Number(body.contentId);
        const kind = String(body.kind);
        const routes: Record<string, string> = { quiz: "quizzes", discussion: "discussion_topics", file: "files", person: "users" };
        if (!Number.isSafeInteger(contentId) || contentId <= 0 || !Object.hasOwn(routes, kind)) return respond({ error: "Choose valid course content." }, 400);
        if (kind === "person") return respond(await loadCoursePerson(courseId, contentId,
          async path => (await canvasRequest(connection.canvas_url, path, token)).data,
          path => optionalCanvasRequest(connection.canvas_url, path, token),
          path => optionalCanvasList(connection.canvas_url, path, token),
        ));
        const item = (await canvasRequest(connection.canvas_url, "/api/v1/courses/" + courseId + "/" + routes[kind] + "/" + contentId, token)).data;
        if (kind === "file") return respond({ id: item.id, name: item.display_name || item.filename, contentType: item["content-type"], size: item.size, updatedAt: item.updated_at, locked: Boolean(item.locked_for_user || item.hidden_for_user), url: safeLink(item.url), previewUrl: safeLink(item.preview_url) });
        if (kind === "quiz") return respond({ id: item.id, title: item.title, description: item.description || "", dueAt: item.due_at || null, lockAt: item.lock_at || null, unlockAt: item.unlock_at || null, locked: Boolean(item.locked_for_user), lockExplanation: item.lock_explanation || null, questionCount: item.question_count ?? null, points: item.points_possible ?? null, quizType: item.quiz_type, htmlUrl: safeLink(item.html_url, connection.canvas_url) });
        return respond({ id: item.id, title: item.title, message: item.message || "", authorName: item.author?.display_name || "", authorAvatarUrl: safeLink(item.author?.avatar_image_url), postedAt: item.posted_at || item.created_at, locked: Boolean(item.locked_for_user), htmlUrl: safeLink(item.html_url, connection.canvas_url) });
      }

      if (body.action === "course_tool") {
        const toolId = Number(body.toolId);
        if (!Number.isSafeInteger(toolId) || toolId <= 0) {
          return respond({ error: "Choose a valid course tool." }, 400);
        }
        const tabs = await optionalCanvasList(connection.canvas_url, `/api/v1/courses/${courseId}/tabs`, token);
        const tab = tabs.find((tab: any) => !tab.hidden && tab.id === `context_external_tool_${toolId}`);
        const institutionPolicy = new URL(connection.canvas_url).hostname === "catcourses.ucmerced.edu" && toolId === 1282;
        if (!tab && !institutionPolicy) return respond({ error: "This tool is not available in this course." }, 404);
        // The shared policy is available even when an instructor hides its navigation tab.
        // Canvas still authorizes both course access and the launch with this user's token.
        if (!tab) await canvasRequest(connection.canvas_url, "/api/v1/courses/" + courseId, token);
        const launch = await canvasRequest(connection.canvas_url,
          `/api/v1/courses/${courseId}/external_tools/sessionless_launch?id=${toolId}&launch_type=course_navigation`, token);
        const url = safeLink(launch.data?.url, connection.canvas_url);
        if (!url) return respond({ error: "The service did not provide a launch link. Try again." }, 502);
        return respond(await readToolContent(url, connection.canvas_url, institutionPolicy ? "Resources & Policy" : tab?.label || "Course tool"));
      }

      if (body.action === "course_file") {
        const fileId = Number(body.fileId);
        if (!Number.isSafeInteger(fileId) || fileId <= 0) {
          return respond({ error: "Choose a valid course file." }, 400);
        }
        if (body.preview === true) return respond(await loadFilePreview(
          connection.canvas_url, token, fileId,
          async path => (await canvasRequest(connection.canvas_url, path, token)).data,
        ));
        const file = await courseFile(connection.canvas_url, token, fileId);
        return new Response(file.body, {
          headers: {
            ...headers,
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": `inline; filename="${file.name}"`,
            "Content-Type": "application/octet-stream",
            "X-Moofie-Content-Type": file.contentType,
          },
        });
      }

      const assignmentId = Number(body.assignmentId);
      if (
        (body.action === "assignment_details" || body.action === "submit_assignment") &&
        (!Number.isSafeInteger(assignmentId) || assignmentId <= 0)
      ) {
        return respond({ error: "Choose a valid assignment." }, 400);
      }
      if (body.action === "assignment_details") {
        return respond(
          await assignmentDetails(connection.canvas_url, token, courseId, assignmentId),
        );
      }
      if (body.action === "submit_assignment") {
        if (!body.submission || typeof body.submission !== "object") {
          return respond({ error: "Enter a valid submission." }, 400);
        }
        return respond(
          await submitAssignment(
            connection.canvas_url,
            token,
            courseId,
            assignmentId,
            body.submission,
          ),
        );
      }

      const pageUrl = String(body.pageUrl || "").trim();
      if (!pageUrl || pageUrl.length > 512) {
        return respond({ error: "Choose a valid course page." }, 400);
      }
      return respond(
        await coursePage(connection.canvas_url, token, courseId, pageUrl),
      );
    }
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
