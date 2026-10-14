import { gradeSnapshots, gradeChanged, gradeKey } from '../../supabase/functions/_shared/gradeNotifications.js';

export function updateGradeHistory(previous, courses, userId, now = new Date().toISOString()) {
  const snapshots = gradeSnapshots(courses, userId, now);
  const previousById = new Map((previous?.snapshots || []).map(grade => [gradeKey(grade), grade]));
  const changes = previous ? snapshots.filter(grade => gradeChanged(previousById.get(gradeKey(grade)), grade)) : [];
  const visibleCourses = new Set(snapshots.map(grade => grade.course_id));
  // First visit shows existing grades as history without making them new alerts.
  const initial = previous ? previous.events || [] : snapshots.filter(grade => grade.score !== null)
    .map(grade => ({ ...grade, observedAt: grade.graded_at || '1970-01-01T00:00:00.000Z' }));
  const events = new Map(initial.filter(grade => visibleCourses.has(grade.course_id)).map(grade => [gradeKey(grade), grade]));
  for (const grade of changes) events.set(gradeKey(grade), { ...grade, observedAt: now });
  return { snapshots, events: [...events.values()].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt)).slice(0, 50) };
}
