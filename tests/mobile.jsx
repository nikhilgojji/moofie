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
  if (new URLSearchParams(location.search).get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  return <CourseDetails course={course} data={{ courses: [course], profile: { name: 'Demo' } }} user={{ id: 'fixture' }} refreshFeedback={{ phase: 'idle', distance: 0 }} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
