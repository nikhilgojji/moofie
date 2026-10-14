import { isExcludedCourse, numericScore } from './gradeData.js';

// Assignment id 0 is reserved for the course's current overall grade.
export function gradeSnapshots(courses, userId, now = new Date().toISOString()) {
  return courses.filter(course => !isExcludedCourse(course)).flatMap(course => {
    const base = { user_id: userId, course_id: Number(course.id), course_name: course.name || 'Course', updated_at: now };
    return [{
      ...base, assignment_id: 0, assignment_title: 'Overall grade',
      score: numericScore(course.grade), grade: course.letter || null,
      points_possible: 100, graded_at: null, html_url: course.htmlUrl || null,
    }, ...(course.assignments || []).map(assignment => ({
      ...base, assignment_id: Number(assignment.id), assignment_title: assignment.title || 'Assignment',
      score: assignment.graded === false || assignment.excused ? null : numericScore(assignment.earned),
      grade: assignment.grade || null, points_possible: numericScore(assignment.points) ?? 0,
      graded_at: assignment.gradedAt || null, html_url: assignment.htmlUrl || null,
    }))];
  });
}

export function gradeKey(grade) { return `${grade.course_id}-${grade.assignment_id}`; }

export function gradeChanged(previous, current) {
  if (numericScore(current.score) === null) return false;
  if (!previous || numericScore(previous.score) === null) return true;
  return numericScore(previous.score) !== numericScore(current.score)
    || numericScore(previous.points_possible) !== numericScore(current.points_possible)
    || (previous.grade !== undefined && (previous.grade || null) !== (current.grade || null))
    || Boolean(current.graded_at && current.graded_at !== previous.graded_at);
}

export function gradeText(grade) {
  return grade.assignment_id === 0
    ? `${grade.grade ? `${grade.grade} · ` : ''}${grade.score}%`
    : `${grade.score} / ${grade.points_possible} pts`;
}

export function notificationFor(changes) {
  if (changes.length === 1) {
    const grade = changes[0];
    return {
      title: grade.assignment_id === 0 ? `${grade.course_name}: overall grade updated` : `${grade.assignment_title}: grade posted or updated`,
      body: `${grade.course_name} · ${gradeText(grade)}`,
      tag: `grade-${gradeKey(grade)}`, url: '/',
    };
  }
  return { title: `${changes.length} grade updates`, body: 'New or changed grades are ready in Moofie.', tag: 'moofie-grade-updates', url: '/' };
}
