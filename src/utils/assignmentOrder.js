export function assignmentCategory(item, now = Date.now()) {
  if (!item.dueAt || !Number.isFinite(Date.parse(item.dueAt))) return "Undated Assignments";
  if (Date.parse(item.dueAt) > now) return "Upcoming Assignments";
  const types = item.submissionTypes || [];
  const acceptsSubmission = types.length > 0 && !types.some(type => ["", "none", "not_graded", "on_paper", "external_tool", "online_quiz", "attendance"].includes(type));
  if (acceptsSubmission && !item.locked && !item.submitted && !item.graded && item.earned == null && !item.excused) return "Overdue Assignments";
  return "Past Assignments";
}

export const assignmentCategories = ["Overdue Assignments", "Upcoming Assignments", "Undated Assignments", "Past Assignments"];

export function sortCourseAssignments(assignments, now = Date.now()) {
  const due = item => item.dueAt && Number.isFinite(Date.parse(item.dueAt)) ? Date.parse(item.dueAt) : null;
  const bucket = item => assignmentCategories.indexOf(assignmentCategory(item, now));
  return [...assignments].sort((a, b) => {
    const category = bucket(a) - bucket(b);
    if (category) return category;
    if (due(a) != null && due(b) != null && due(a) !== due(b)) return bucket(a) === 3 ? due(b) - due(a) : due(a) - due(b);
    // Canvas creates a new position-sorted assignment collection for each
    // date category. Group order breaks ties; it is not the primary sort.
    return (a.position ?? 0) - (b.position ?? 0) || (a.groupPosition ?? 0) - (b.groupPosition ?? 0);
  });
}
