import { useState } from "react";
import { quizGroups, quizMetadata, sortQuizzes } from "../utils/quizDisplay";

export function CourseQuizzes({ quizzes = [], onOpen }) {
  const [query, setQuery] = useState("");
  const filtered = sortQuizzes(quizzes.filter(quiz => quiz.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const groups = [...quizGroups, [null, "Quizzes"]].map(([types, label]) => ({ label, items: filtered.filter(quiz => types ? types.includes(quiz.quizType) : !quizGroups.some(([types]) => types.includes(quiz.quizType))) })).filter(group => group.items.length);
  return <div className="course-quizzes-list">
    <label className="quiz-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></svg><input type="search" aria-label="Search for Quiz" placeholder="Search for Quiz" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <div className="canvas-assignment-groups">{groups.map(group => <details className="canvas-assignment-group quiz-group" key={group.label} open>
      <summary>{group.label}</summary>
      {group.items.map(quiz => <button className="canvas-assignment-row quiz-row" type="button" key={quiz.id} onClick={() => onOpen(quiz)}>
        <svg className="course-list-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M9 15 5 11l5-5c3-3 7-3 11-3 0 4 0 8-3 11l-5 5-4-4ZM10 6 5 6 2 11l3 0M18 14v5l-5 3v-3M5 15l-3 3M8 18l-3 3" /><circle cx="16" cy="8" r="2" /></svg>
        <span className="canvas-assignment-copy"><strong>{quiz.title}</strong><span className="canvas-assignment-meta">{quizMetadata(quiz).map((item, index) => <span key={index}>{item}</span>)}</span></span>
      </button>)}
    </details>)}</div>
    {!groups.length && <p className="home-resource-empty">{query ? "No quizzes match your search." : "No quizzes."}</p>}
  </div>;
}
