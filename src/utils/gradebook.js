// Store this conversion once so relative-date calculations stay readable.
const DAY_MS = 86_400_000;

// Turn an ISO timestamp from Canvas into a short date students can scan quickly.
export function formatDueDate(value) {
  if (!value) return "No due date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// Omitted assignments should not affect counts, previews, or grade calculations.
export function activeAssignments(course) {
  return (course.assignments || []).filter((assignment) => !assignment.omitted);
}

// An assignment is upcoming only if it is still actionable and due in the future.
export function isUpcoming(assignment, now = new Date()) {
  return Boolean(
    assignment.dueAt &&
      new Date(assignment.dueAt) >= now &&
      !assignment.submitted &&
      !assignment.missing,
  );
}

// Produce the small totals displayed on each course card.
export function courseAssignmentCounts(course) {
  const assignments = activeAssignments(course);

  return {
    total: assignments.length,
    upcoming: assignments.filter((assignment) => isUpcoming(assignment)).length,
  };
}

// Combine assignments across courses for the upcoming and missing dashboards.
export function getAssignmentList(courses, type) {
  const now = new Date();

  return courses
    .flatMap((course) =>
      activeAssignments(course)
        .filter((assignment) =>
          type === "upcoming"
            ? isUpcoming(assignment, now)
            : assignment.missing,
        )
        .map((assignment) => ({ course, assignment })),
    )
    .sort((first, second) => {
      if (type === "missing") return 0;
      return new Date(first.assignment.dueAt) - new Date(second.assignment.dueAt);
    });
}

// Map a letter grade to the semantic color name used by CSS.
export function gradeTone(letter) {
  const value = String(letter || "").toUpperCase();

  if (value.startsWith("A") || value.startsWith("B")) return "positive";
  if (value.startsWith("C")) return "warning";
  if (value.startsWith("D") || value.startsWith("F")) return "negative";
  return "neutral";
}

// Find the newest course or assignment update and describe it in plain language.
export function formatCourseUpdatedAt(course) {
  const timestamps = [
    course.updatedAt,
    ...(course.assignments || []).map((assignment) => assignment.updatedAt),
  ]
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (!timestamps.length) return "No recent updates";

  const daysAgo = Math.floor((Date.now() - Math.max(...timestamps)) / DAY_MS);

  if (daysAgo <= 0) return "Updated today";
  if (daysAgo === 1) return "Updated yesterday";
  if (daysAgo > 30) return "No recent updates";
  return `Updated ${daysAgo} days ago`;
}

// Calculate one assignment group's score using the user's current what-if values.
export function calculateGroupGrade(assignments, values) {
  let earned = 0;
  let possible = 0;

  assignments.forEach((assignment) => {
    if (assignment.omitted || assignment.excused) return;

    const value = values[assignment.id];
    if (value === "" || value === null || value === undefined) return;

    earned += Math.min(Number(value), assignment.points);
    possible += assignment.points;
  });

  return {
    earned,
    possible,
    percent: possible ? (earned / possible) * 100 : null,
  };
}

// Return raw earned/possible totals for the group summary table.
export function groupPointTotals(assignments, values) {
  return assignments
    .filter((assignment) => !assignment.omitted && !assignment.excused)
    .reduce(
      (totals, assignment) => {
        const possible = Number(assignment.points) || 0;
        const entered = Number(values[assignment.id]);
        const earned = Number.isFinite(entered)
          ? Math.min(Math.max(entered, 0), possible)
          : 0;

        return {
          earned: totals.earned + earned,
          possible: totals.possible + possible,
        };
      },
      { earned: 0, possible: 0 },
    );
}

// Avoid trailing decimals for whole point values.
export function formatPoints(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

// Format a numeric percentage while retaining at most two useful decimal places.
export function formatPercent(value) {
  if (!Number.isFinite(Number(value))) return "—";

  const number = Number(value);
  const rounded = Number(number.toFixed(2));
  return `${Number.isInteger(rounded) ? Math.round(number) : number.toFixed(2)}%`;
}

// Apply the project's conventional plus/minus grading thresholds.
export function gradeLetterForPercent(percent) {
  if (percent >= 93) return "A";
  if (percent >= 90) return "A−";
  if (percent >= 87) return "B+";
  if (percent >= 83) return "B";
  if (percent >= 80) return "B−";
  if (percent >= 77) return "C+";
  if (percent >= 73) return "C";
  if (percent >= 70) return "C−";
  if (percent >= 67) return "D+";
  if (percent >= 65) return "D";
  return "F";
}

// Calculate the overall projected grade from all groups containing scored work.
export function calculateCourseGrade(course, values) {
  const results = course.groups
    .map((group) => ({
      ...calculateGroupGrade(group.assignments, values),
      weight: group.weight,
    }))
    .filter((group) => group.possible > 0);

  if (!results.length) return null;

  if (course.weighted && results.some((group) => group.weight > 0)) {
    const weightTotal = results.reduce((total, group) => total + group.weight, 0);
    return (
      results.reduce(
        (total, group) => total + group.percent * group.weight,
        0,
      ) / weightTotal
    );
  }

  const earned = results.reduce((total, group) => total + group.earned, 0);
  const possible = results.reduce((total, group) => total + group.possible, 0);
  return (earned / possible) * 100;
}
