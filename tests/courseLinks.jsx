import React from 'react';
import { createRoot } from 'react-dom/client';
import { SafeCourseHtml } from '../src/components/SafeCourseHtml';
import { CourseModules } from '../src/components/CourseModules';
import { ExternalAssignmentLaunch } from '../src/components/ExternalAssignmentLaunch';
import { useHistoryState } from '../src/utils/navigation';
import '../src/styles.css';
import '../src/reference-theme.css';

const courseId = Number(new URLSearchParams(location.search).get('course')) || 4;
const base = `https://canvas.example/courses/${courseId}/pages/home`;
const html = `<p><a href="/courses/${courseId}/assignments/72">Reading assignment</a></p>
<p><a href="/courses/${courseId}/quizzes/73">Practice quiz</a></p>
<p><a href="/courses/${courseId}/files?preview=76">Schedule preview</a></p>
<p><a href="/courses/29/files/77/preview">Cross-course handout</a></p>
<p><a href="/courses/${courseId}/modules/items/88">Specific module item</a></p>
<p><a href="/courses/${courseId}/external_tools/retrieve?assignment_id=72">Canvas tool action</a></p>`;

function Fixture() {
  const [viewer] = useHistoryState('moofieViewer', null);
  return <main style={{ padding: 24 }}>
    <h1>Course links</h1>
    <output data-testid="destination">{viewer ? `${viewer.courseId}:${viewer.type}:${viewer.item.id}` : 'none'}</output>
    <SafeCourseHtml html={html} baseUrl={base} />
    <div className="home-resource-grid"><CourseModules modules={[{ id: 8, name: 'Week 1', items: [{ id: 99, title: 'External module quiz' }] }]} renderItem={(item, module) =>
      <ExternalAssignmentLaunch className="home-resource-row" courseId={courseId} moduleId={module.id} moduleItemId={item.id} title={item.title} canvasUrl={`${base}/fallback`} />
    } /></div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
