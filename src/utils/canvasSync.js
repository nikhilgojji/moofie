import { classifyIssue, reportIssue } from './issueReporting.js';
const listeners = new Set();
let snapshot = { records: {}, coverage: {}, version: 0 };
let generation = 0;
export const subscribeCanvasSync = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const getCanvasSync = () => snapshot;
function publish(records) { snapshot = { ...snapshot, records, version: snapshot.version + 1 }; listeners.forEach(listener => listener()); }
export function resetCanvasSync() { generation++; snapshot = { ...snapshot, coverage: {} }; publish({}); }
export function updateCanvasCoverage(courseId, value) {
  snapshot = { ...snapshot, coverage: { ...snapshot.coverage, [courseId]: value } };
  publish(snapshot.records);
}
export function updateCanvasSync(key, value) {
  const records = { ...snapshot.records };
  const previous = records[key]; delete records[key];
  records[key] = { ...previous, ...value };
  const keys = Object.keys(records);
  while (keys.length > 200) delete records[keys.shift()];
  publish(records);
}
export const READ_ACTIONS = new Set(["dashboard", "course_resources", "course_page", "course_content", "course_file", "course_tool", "assignment_details"]);
export function retryableCanvasError(error) {
  const message = String(error?.message || "");
  if (/(401|403|404)|token|sign in|locked|permission|not available/i.test(message)) return false;
  return [408, 429, 500, 502, 503, 504].includes(error?.status) || /network|fetch|timeout|timed? out|too long|failed to send|\b(408|429|500|502|503|504)\b|comparison/i.test(message);
}

// Bound concurrency and retries per browser so recovery doesn't hammer Canvas.
let active = 0;
const waiting = [];
async function acquire() { if (active >= 4) await new Promise(resolve => waiting.push(resolve)); else active++; }
function release() { const next = waiting.shift(); if (next) next(); else active--; }
export async function recoverCanvasRead(action, payload, operation, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), random = Math.random } = {}) {
  if (!READ_ACTIONS.has(action)) return operation(); // Never retry submissions or account mutations.
  const epoch = generation;
  const key = JSON.stringify([action, payload]);
  const set = value => { if (epoch === generation) updateCanvasSync(key, { action, courseId: payload?.courseId, ...value }); };
  set({ status: "checking", error: null });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (epoch !== generation) throw new Error("The signed-in account changed. Please retry.");
    await acquire();
    try {
      if (epoch !== generation) throw new Error("The signed-in account changed. Please retry.");
      const result = await operation();
      if (epoch !== generation) throw new Error("The signed-in account changed. Please retry.");
      const checkedAt = result?._sync?.checkedAt || new Date().toISOString();
      if (result?._sync?.partial) reportIssue({ area: action, code: 'partial' });
      set({ status: result?._sync?.partial ? "partial" : "current", checkedAt, error: null, checks: result?._sync?.checks || null });
      return result;
    } catch (error) {
      if (attempt === 2 || !retryableCanvasError(error)) {
        if (epoch === generation) reportIssue({ area: action, code: classifyIssue(error) });
        set({ status: "error", error: error.message }); throw error;
      }
      set({ status: "retrying", error: error.message });
    } finally { release(); }
    await sleep(Math.min(5000, 700 * 2 ** attempt) + random() * 400);
  }
}

export function mergeCourseResources(previous, next) {
  if (!previous) return next;
  const merged = { ...next };
  for (const [key, status] of Object.entries(next?._sync?.sections || {})) {
    // Only retain last successful data for transient failures; permissions must revoke it.
    if (status === "error" && previous[key] != null) merged[key] = previous[key];
    if (key === "home" && status === "error") merged.course = { ...merged.course, homeBody: previous.course?.homeBody, homeTitle: previous.course?.homeTitle, hasFrontPage: previous.course?.hasFrontPage };
    if (key === "settings" && status === "error") merged.course = { ...merged.course, showHomeAnnouncements: previous.course?.showHomeAnnouncements, homeAnnouncementLimit: previous.course?.homeAnnouncementLimit };
  }
  return merged;
}

export function courseSectionStatus(resources, section) {
  const key = { "course-overview": "home", "course-syllabus": "course", "course-activity": "activity", "course-discussions": "discussions", "course-announcements": "announcements", "course-files": "files", "course-pages": "pages", "course-modules": "modules", "course-quizzes": "quizzes" }[section];
  return resources?._sync?.sections?.[key];
}

export function startCanvasAutoRefresh(refresh, { target = window, doc = document, now = Date.now, interval = 120_000 } = {}) {
  let last = now(), running = false;
  async function check(force = false) {
    if (running || doc.visibilityState === "hidden" || target.navigator?.onLine === false || !force && now() - last < interval) return;
    running = true; last = now();
    try { await refresh(); } catch { /* Read failures are recorded by recoverCanvasRead; retry on the next cycle. */ } finally { running = false; }
  }
  const onVisible = () => { if (doc.visibilityState !== "hidden") check(); };
  const onOnline = () => check(true);
  const timer = target.setInterval(check, interval);
  target.addEventListener("focus", onVisible); target.addEventListener("online", onOnline); doc.addEventListener("visibilitychange", onVisible);
  return () => { target.clearInterval(timer); target.removeEventListener("focus", onVisible); target.removeEventListener("online", onOnline); doc.removeEventListener("visibilitychange", onVisible); };
}
