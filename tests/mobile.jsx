// Browser fixtures use synthetic data with the actual app components and styles.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/libre-franklin';
import '../src/styles.css';
import '../src/reference-theme.css';
import { CourseDetails } from '../src/App';
const assignment = { id: 1, title: 'A very long assignment title with detailed instructor instructions for the final project', points: 100, earned: 90, submitted: true, dueAt: '2026-09-20T17:00:00Z' };
const course = { id: 1, name: 'DEMO 101', assignments: [assignment], groups: [{ id: 1, name: 'Projects and extended laboratory assignments', weight: 100, assignments: [assignment], rules: {} }] };
function Fixture() {
  const query = new URLSearchParams(location.search);
  if (query.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  const quizzes = [10, 5, 10].map((earned, id) => ({ id: id + 1, title: `Unit 0${id} Quiz`, points: 10, earned }));
  const selectedCourse = query.get('case') === 'drops'
    ? { id: 2, name: 'PHYS 009', weighted: true, assignments: quizzes, groups: [{ id: 2, name: 'Quizzes', weight: 30, assignments: quizzes, rules: { dropLowest: 1 } }] }
    : course;
  return <CourseDetails course={selectedCourse} data={{ courses: [selectedCourse], profile: { name: 'Demo' } }} user={{ id: 'fixture' }} refreshFeedback={{ phase: 'idle', distance: 0 }} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
