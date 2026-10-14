import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/libre-franklin';
import '../src/styles.css';
import '../src/reference-theme.css';
import { SignedInNav } from '../src/components/SiteChrome';
const quiz = { id: 2, title: 'Quiz 1', points: 10, earned: 8, graded: true, gradedAt: '2026-10-01T12:00:00Z', htmlUrl: 'https://catcourses.ucmerced.edu/courses/39/assignments/7' };
function Fixture() {
  const [course, setCourse] = useState({ id: 39, name: 'PHYS 009', grade: 80, letter: 'B', assignments: [quiz] });
  return <><SignedInNav data={{ profile: { name: 'Test student' }, courses: [course] }} user={{ id: 'notification-fixture' }} />
    <main className="grades-content"><h1>Notification test</h1>
      <button onClick={() => setCourse(old => ({ ...old, assignments: [...old.assignments, { id: 3, title: 'Ungraded work', points: 20, earned: null }] }))}>Create assignment</button>
      <button onClick={() => setCourse(old => ({ ...old, grade: 90, letter: 'A', assignments: old.assignments.map(item => item.id === 2 ? { ...item, earned: 9 } : item) }))}>Post grade</button>
      <button onClick={() => setCourse(old => ({ ...old, assignments: old.assignments.map(item => ({ ...item, updatedAt: new Date().toISOString() })) }))}>Edit instructions</button>
    </main></>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
