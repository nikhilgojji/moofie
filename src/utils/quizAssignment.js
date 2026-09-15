export function quizAssignmentNavigation(viewer, assignment) {
  const quizId = Number(assignment?.quizId);
  if (viewer?.type !== 'assignment' || !Number.isSafeInteger(quizId) || quizId <= 0) return null;
  return {
    moofieView: 'home',
    moofieHomeCourse: viewer.courseId,
    moofieHomeSection: 'course-quizzes',
    moofieCourseAssignment: null,
    moofieGradeAssignment: null,
    moofieViewer: { ...viewer, type: 'quiz', sectionId: 'course-quizzes', item: { id: quizId, title: assignment.title, needsDetails: true } },
  };
}
