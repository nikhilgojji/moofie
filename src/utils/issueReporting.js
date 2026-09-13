// Only these fixed categories leave the browser. Never forward errors, URLs,
// stack traces, payloads, names, IDs, document contents, or browser fingerprints.
export const ISSUE_AREAS = ['dashboard', 'course_resources', 'course_page', 'course_content', 'course_file', 'course_tool', 'assignment_details', 'preview', 'app'];
export const ISSUE_CODES = ['network', 'timeout', 'unavailable', 'access', 'invalid_data', 'render', 'partial', 'unknown'];
export const ISSUE_KINDS = ['none', 'pdf', 'image', 'text', 'html', 'video', 'audio', 'document', 'spreadsheet'];
export function classifyIssue(error) {
  const message = String(error?.message || '').toLowerCase();
  if ([401, 403, 404].includes(error?.status)) return 'access';
  if (/timeout|timed? out|too long/.test(message)) return 'timeout';
  if (/network|fetch|failed to send/.test(message)) return 'network';
  if (/locked|permission|sign in|token/.test(message)) return 'access';
  if ([429, 500, 502, 503, 504].includes(error?.status)) return 'unavailable';
  if (/invalid|corrupt|unsupported/.test(message)) return 'invalid_data';
  return 'unknown';
}
export function sanitizeIssue(input, viewport = 1024) {
  return {
    area: ISSUE_AREAS.includes(input?.area) ? input.area : 'app',
    code: ISSUE_CODES.includes(input?.code) ? input.code : 'unknown',
    kind: ISSUE_KINDS.includes(input?.kind) ? input.kind : 'none',
    device: viewport <= 760 ? 'mobile' : 'desktop',
  };
}

// In-memory only, scoped to the current signed-in session. Failures in reporting
// must never block course loads or recursively generate more reports.
export function createIssueReporter({ send, now = Date.now, viewport = () => 1024, schedule = setTimeout, cancel = clearTimeout, online = () => true }) {
  let enabled = false, generation = 0, timer, running = false, sent = 0, windowStart = now();
  let queue = [], seen = new Map();
  function session(active) {
    generation++; enabled = active; queue = []; seen.clear(); sent = 0; windowStart = now();
    if (timer) cancel(timer); timer = undefined;
  }
  function arm(delay = 3000) {
    if (!timer && enabled && queue.length) timer = schedule(() => { timer = undefined; void flush(); }, delay);
  }
  async function flush() {
    if (running || !enabled || !queue.length) return;
    if (!online()) { arm(30_000); return; }
    running = true;
    const epoch = generation, batch = queue.splice(0, 10);
    try { await send(batch.map(item => item.value)); }
    catch {
      // One delayed retry, bounded queue, and no persistence across accounts.
      if (epoch === generation) queue = [...batch.filter(item => !item.retried).map(item => ({ ...item, retried: true })), ...queue].slice(0, 20);
    } finally { running = false; arm(30_000); }
  }
  function report(input) {
    if (!enabled) return;
    if (now() - windowStart >= 600_000) { sent = 0; windowStart = now(); seen.clear(); }
    const value = sanitizeIssue(input, viewport()), key = JSON.stringify(value);
    if (sent >= 20 || queue.length >= 20 || seen.has(key) && now() - seen.get(key) < 300_000) return;
    seen.set(key, now()); sent++; queue.push({ value }); arm();
  }
  return { report, flush, session, dispose: () => session(false) };
}

let currentReporter;
export function setIssueReporter(reporter) { currentReporter = reporter; }
export function reportIssue(input) { currentReporter?.report(input); }
