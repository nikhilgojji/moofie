// Browser fixtures use synthetic data with the actual app components and styles.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/libre-franklin';
import '../src/styles.css';
import '../src/reference-theme.css';
import { CourseDetails } from '../src/App';
import { CourseNavigation } from '../src/components/CourseNavigation';
import { DocumentToolbar } from '../src/components/DocumentToolbar';
const assignment = { id: 1, title: 'A very long assignment title with detailed instructor instructions for the final project', points: 100, earned: 90, submitted: true, dueAt: '2026-09-20T17:00:00Z' };
const course = { id: 1, name: 'DEMO 101', assignments: [assignment], groups: [{ id: 1, name: 'Projects and extended laboratory assignments', weight: 100, assignments: [assignment], rules: {} }] };
function Fixture() {
  const [active, setActive] = useState('home');
  const [page, setPage] = useState(1), [zoom, setZoom] = useState(1), [rotation, setRotation] = useState(0);
  const query = new URLSearchParams(location.search);
  if (query.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  if (query.get('view') === 'document') return <section className="document-reader">
    <header className="document-reader-header"><h1>A long schedule document title.xlsx</h1><div className="document-reader-actions"><button aria-label="Close document">×</button></div></header>
    <div className="document-reader-content"><div className="moofie-pdf"><DocumentToolbar pageNumber={page} pageCount={5} onPageChange={setPage} scale={zoom} onZoom={amount => setZoom(value => value + amount)} onFit={() => setZoom(1)} onRotate={() => setRotation(value => value + 90)} onFullscreen={() => {}} /><div className="moofie-pdf-pages"><p>Page {page}, rotation {rotation}</p></div></div></div>
    <footer className="document-reader-footer"><div><button>Previous</button><button>Next</button></div><button>Close</button></footer>
  </section>;
  if (query.get('view') === 'navigation') return <main className="course-content-layout has-course-navigation"><aside className="course-content-navigation"><CourseNavigation activeSection={active} items={['Home','Announcements','Syllabus','Modules','Assignments','Quizzes','Discussions','Grades','People','Pages','Files','Resources & Policy'].map((label, index) => ({ id: index, label, navigationKey: label.toLowerCase(), section: label.toLowerCase() }))} onSelect={tab => setActive(tab.navigationKey)} /></aside><article><h1>{active}</h1><p>Course content</p></article></main>;
  return <CourseDetails course={course} data={{ courses: [course], profile: { name: 'Demo' } }} user={{ id: 'fixture' }} refreshFeedback={{ phase: 'idle', distance: 0 }} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
