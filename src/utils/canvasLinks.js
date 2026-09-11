const sections = { "": "course-overview", modules: "course-modules", assignments: "course-assignments", syllabus: "course-syllabus", announcements: "course-announcements", discussion_topics: "course-discussions", quizzes: "course-quizzes", users: "course-people", pages: "course-pages", files: "course-files" };

export function canvasLinkNavigation(value, baseUrl, title = "Course content") {
  let url, base;
  try { base = new URL(baseUrl); url = new URL(value, base); } catch { return null; }
  if (url.origin !== base.origin || url.protocol !== "https:" || url.username || url.password) return null;
  const path = url.pathname.replace(/^\/api\/v1/, "");
  const match = path.match(/^\/courses\/([1-9]\d*)(?:\/(.*))?$/);
  const courseId = Number(match?.[1] || base.pathname.match(/\/courses\/([1-9]\d*)/)?.[1]);
  if (!Number.isSafeInteger(courseId) || courseId <= 0) return null;
  const route = (match?.[2] ?? path.replace(/^\//, "")).replace(/\/$/, "");
  const patch = { moofieView: "home", moofieHomeCourse: courseId, moofieViewer: null, moofieGradeAssignment: null, moofieCourseAssignment: null };
  if (route === "assignments/syllabus") return { ...patch, moofieHomeSection: "course-syllabus" };
  if (match && route === "grades") return { ...patch, moofieView: "grades", moofieCourse: courseId };
  if (match && Object.hasOwn(sections, route)) return { ...patch, moofieHomeSection: sections[route] };
  if (match && /^modules\/items\/\d+$/.test(route)) return { ...patch, moofieHomeSection: "course-modules" };
  const resource = route.match(/^(pages|assignments|quizzes|discussion_topics|files|external_tools|users)\/([^/]+)(?:\/(?:download|preview))?$/);
  if (!resource) return null;
  const [, kind, rawId] = resource;
  if (kind !== "pages" && !/^[1-9]\d*$/.test(rawId)) return null;
  let id;
  try { id = decodeURIComponent(rawId); } catch { return null; }
  const type = { pages: "page", assignments: "assignment", quizzes: "quiz", discussion_topics: "discussion", files: "file", external_tools: "course-tool", users: "person" }[kind];
  const sectionId = kind === "external_tools" ? `course-tab-context_external_tool_${id}` : sections[kind];
  const item = { id, title, name: title, htmlUrl: url.href, ...(kind === "pages" ? { pageUrl: id } : {}), ...(kind === "external_tools" ? { toolId: id } : {}), ...(["quizzes", "discussion_topics", "files"].includes(kind) ? { needsDetails: true } : {}) };
  return { ...patch, moofieHomeSection: sectionId, moofieViewer: { type, label: title, item, courseId, sectionId, baseUrl: url.href, returnView: "home" } };
}
