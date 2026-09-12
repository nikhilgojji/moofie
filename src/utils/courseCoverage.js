// Background reads use the signed-in user's ordinary Canvas API. Never launch
// external tools, submit work, download every attachment, or retain page bodies.
export function startCourseCoverage({ courses, readResources, readPage, onResources = () => {}, report = () => {}, target = window, doc = document, now = Date.now, interval = 15 * 60_000, spacing = 5000 }) {
  let stopped = false, running = false;
  const jobs = new Map();
  const courseState = new Map();
  const key = (courseId, pageUrl) => JSON.stringify([courseId, pageUrl ?? null]);
  for (const course of courses) {
    if (courseState.has(course.id)) continue;
    courseState.set(course.id, { name: course.name, status: "queued", checkedAt: null });
    jobs.set(key(course.id), { courseId: course.id, next: 0, failures: 0 });
  }
  function publish(courseId) {
    if (stopped) return;
    const pages = [...jobs.values()].filter(job => job.courseId === courseId && job.pageUrl != null);
    report(courseId, { ...courseState.get(courseId), pages: pages.length,
      checkedPages: pages.filter(job => job.status === "current").length,
      failedPages: pages.filter(job => job.status === "error").length,
      restrictedPages: pages.filter(job => job.status === "restricted").length });
  }
  for (const id of courseState.keys()) publish(id);
  async function tick() {
    if (stopped || running || target.navigator?.onLine === false || doc.visibilityState === "hidden") return;
    // Move each completed job to the end: a failing course cannot starve others.
    const job = [...jobs.values()].find(item => item.next <= now());
    if (!job) return;
    running = true;
    const state = courseState.get(job.courseId);
    if (job.pageUrl == null) { state.status = "checking"; publish(job.courseId); }
    try {
      if (job.pageUrl == null) {
        const result = await readResources(job.courseId);
        if (stopped) return;
        if (!result?.course || !result?._sync?.checks) throw new Error("Canvas course coverage could not be verified.");
        onResources(job.courseId, result);
        const partial = result._sync.partial;
        state.status = partial ? "partial" : "current";
        state.sections = result._sync.sections;
        if (!partial) state.checkedAt = result._sync.checkedAt;
        const urls = new Set((result.pages || []).map(page => page.pageUrl).filter(Boolean));
        for (const module of result.modules || []) for (const item of module.items || []) {
          if (item.type === "Page" && item.pageUrl && !item.locked) urls.add(item.pageUrl);
        }
        for (const url of urls) if (!jobs.has(key(job.courseId, url))) jobs.set(key(job.courseId, url), { courseId: job.courseId, pageUrl: url, next: 0, failures: 0 });
        if (!partial) for (const [id, page] of jobs) if (page.courseId === job.courseId && page.pageUrl != null && !urls.has(page.pageUrl)) jobs.delete(id);
        job.failures = partial ? job.failures + 1 : 0;
        job.next = now() + (partial ? Math.min(interval, 30_000 * 2 ** Math.min(job.failures - 1, 5)) : interval);
      } else {
        const page = await readPage(job.courseId, job.pageUrl);
        if (stopped) return;
        if (typeof page?.body !== "string" || typeof page?.title !== "string") throw new Error("Canvas returned an incomplete page.");
        job.status = "current"; job.failures = 0; job.next = now() + interval;
      }
    } catch (error) {
      if (stopped) return;
      const restricted = [401, 403, 404].includes(error?.status) || /token|sign in|permission|locked|\b(401|403|404)\b/i.test(error?.message || "");
      job.status = restricted ? "restricted" : "error";
      job.failures++;
      job.next = now() + (restricted ? interval : Math.min(interval, 30_000 * 2 ** Math.min(job.failures - 1, 5)));
      if (job.pageUrl == null) state.status = job.status;
    } finally {
      running = false;
      if (!stopped) {
        const id = key(job.courseId, job.pageUrl);
        jobs.delete(id); jobs.set(id, job);
        publish(job.courseId);
      }
    }
  }
  const resume = () => { void tick(); };
  const refresh = () => { for (const job of jobs.values()) job.next = 0; resume(); };
  const timer = target.setInterval(tick, spacing);
  target.addEventListener("online", resume);
  doc.addEventListener("visibilitychange", resume);
  target.addEventListener("moofie:refresh", refresh);
  return () => { stopped = true; target.clearInterval(timer); target.removeEventListener("online", resume); doc.removeEventListener("visibilitychange", resume); target.removeEventListener("moofie:refresh", refresh); };
}
