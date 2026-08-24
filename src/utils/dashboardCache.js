// Keep a single per-browser dashboard snapshot for at most fifteen minutes.
const DASHBOARD_CACHE_KEY = "moofie-dashboard-cache";
const DASHBOARD_CACHE_TTL_MS = 15 * 60 * 1000;

// Canvas exposes placement and training shells as courses even though they are
// not part of a student's real schedule.
export function sanitizeDashboard(data) {
  if (!data || !Array.isArray(data.courses)) return data;

  return {
    ...data,
    courses: data.courses
      .filter(
        (course) =>
        !/^(placement exam:|shape student training\b)/i.test(
          String(course?.name ?? "").trim(),
        ),
      )
      .map((course) => {
        const hasGradedAssignment = (course.assignments || []).some(
          (assignment) =>
            assignment.earned !== null &&
            assignment.earned !== undefined &&
            !assignment.omitted &&
            !assignment.excused,
        );

        return hasGradedAssignment
          ? course
          : { ...course, grade: null, letter: null };
      }),
  };
}

// Return cached dashboard data only when it belongs to this user and is fresh.
export function readDashboardCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY));
    const isFresh =
      Number.isFinite(cached?.cachedAt) &&
      Date.now() - cached.cachedAt < DASHBOARD_CACHE_TTL_MS;

    if (!isFresh) localStorage.removeItem(DASHBOARD_CACHE_KEY);

    return cached?.userId === userId && isFresh
      ? { found: true, data: sanitizeDashboard(cached.data ?? null) }
      : { found: false, data: null };
  } catch {
    return { found: false, data: null };
  }
}

// Browser caching is optional; storage failures must not break the dashboard.
export function writeDashboardCache(userId, data) {
  try {
    localStorage.setItem(
      DASHBOARD_CACHE_KEY,
      JSON.stringify({
        userId,
        data: sanitizeDashboard(data),
        cachedAt: Date.now(),
      }),
    );
  } catch {
    // The live dashboard still works when browser storage is unavailable.
  }
}

export function clearDashboardCache() {
  try {
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
  } catch {
    // There is nothing else to clear when browser storage is unavailable.
  }
}
