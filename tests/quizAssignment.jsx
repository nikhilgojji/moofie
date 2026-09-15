import React from 'react';
import { createRoot } from 'react-dom/client';
import { CourseContentViewer } from '../src/App';
import { useHistoryState, writeNavigation } from '../src/utils/navigation';
import '../src/styles.css';
import '../src/reference-theme.css';
const params = new URLSearchParams(location.search);
const courseId = Number(params.get('course')) || 39;
const quiz = params.get('entry') === 'quizzes';
const grades = params.get('entry') === 'grades';
document.documentElement.dataset.theme = 'light';
const initialViewer = { type: quiz ? 'quiz' : 'assignment', courseId, sectionId: quiz ? 'course-quizzes' : 'course-assignments', label: 'MATH 141', item: { id: quiz ? 91 : 72, title: 'Lecture quiz 2' } };
writeNavigation({ moofieView: grades ? 'grades' : 'home', moofieGradeAssignment: grades ? initialViewer : null, moofieViewer: grades ? null : initialViewer }, { replace: true });
function Fixture() {
  const [view] = useHistoryState('moofieView', 'home');
  const [gradeAssignment] = useHistoryState('moofieGradeAssignment', null);
  const [viewer] = useHistoryState('moofieViewer', null);
  return <CourseContentViewer viewer={view === 'grades' ? gradeAssignment : viewer} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
