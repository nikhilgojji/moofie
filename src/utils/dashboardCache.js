import { isExcludedCourse, numericScore } from '../../supabase/functions/_shared/gradeData.js';

// Keep a single per-browser dashboard snapshot for at most fifteen minutes.
const DASHBOARD_CACHE_KEY = "moofie-dashboard-cache";
const DASHBOARD_CACHE_TTL_MS = 15 * 60 * 1000;
const DASHBOARD_CACHE_VERSION = 2;

function sanitizeAssignment(assignment) {
  return { ...assignment, earned: assignment.graded === false ? null : numericScore(assignment.earned) };
}

// Canvas exposes placement and training shells as courses even though they are
// not part of a student's real schedule.
export function sanitizeDashboard(data) {
  if (!data || !Array.isArray(data.courses)) return data;

  return {
    ...data,
    courses: data.courses
      .filter((course) => !isExcludedCourse(course))
      .map((original) => {
        const course = {
          ...original,
          grade: numericScore(original.grade),
          assignments: (original.assignments || []).map(sanitizeAssignment),
          groups: (original.groups || []).map(group => ({ ...group, assignments: (group.assignments || []).map(sanitizeAssignment) })),
        };
        const hasGradedAssignment = (course.assignments || []).some(
          (assignment) =>
            assignment.earned !== null &&
            assignment.earned !== undefined &&
            !assignment.omitted &&
            !assignment.excused,
        );

        return hasGradedAssignment
          ? {
              ...course,
              letter:
                String(course.letter || "").toUpperCase() === "A+"
                  ? "A"
                  : course.letter,
            }
          : { ...course, grade: null, letter: null };
      }),
  };
}

// Return cached dashboard data only when it belongs to this user and is fresh.
export function readDashboardCache(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(DASHBOARD_CACHE_KEY));
    const isFresh =
      cached?.version === DASHBOARD_CACHE_VERSION &&
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
        version: DASHBOARD_CACHE_VERSION,
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
