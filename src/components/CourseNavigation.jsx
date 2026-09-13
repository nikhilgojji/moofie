import { useId, useRef, useState } from 'react';

export function CourseNavigation({ activeSection, items, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const menuId = useId(), toggleRef = useRef(null);
  const active = items.find(tab => tab.navigationKey === activeSection);
  const arrow = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>;
  return <nav className="course-menu" aria-label="Course sections" onKeyDown={event => {
    if (event.key === 'Escape' && expanded) { setExpanded(false); toggleRef.current?.focus(); }
  }}>
    <button className="course-menu-toggle" type="button" ref={toggleRef} aria-expanded={expanded} aria-controls={menuId} onClick={() => setExpanded(value => !value)}>
      <span>Course menu{active ? ` · ${active.label}` : ''}</span>{arrow}
    </button>
    <div id={menuId} className={`home-course-navigation course-menu-links${expanded ? ' is-expanded' : ''}`}>
      {items.map(tab => tab.destination?.kind === 'external' ?
        <a key={tab.id} href={tab.destination.url} target="_blank" rel="noreferrer" title={`${tab.label} (opens in a new tab)`} onClick={() => setExpanded(false)}>
          <span>{tab.label}</span><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 17 17 7M7 7h10v10" /></svg></span>
        </a> :
        <button key={tab.id} type="button" aria-current={activeSection === tab.navigationKey ? 'page' : undefined} className={activeSection === tab.navigationKey ? 'is-active' : ''} onClick={() => { setExpanded(false); onSelect(tab); }}>
          <span>{tab.label}</span><span aria-hidden="true">{arrow}</span>
        </button>)}
    </div>
  </nav>;
}
