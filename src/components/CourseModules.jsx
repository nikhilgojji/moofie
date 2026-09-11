import { useState } from "react";

export function CourseModules({ modules, renderItem }) {
  const [collapsed, setCollapsed] = useState({});
  const allCollapsed = modules.length > 0 && modules.every(module => collapsed[module.id]);
  return <>
    {!!modules.length && <div className="module-actions"><button type="button" onClick={() => setCollapsed(Object.fromEntries(modules.map(module => [module.id, !allCollapsed])))}>{allCollapsed ? "Expand All" : "Collapse All"}</button></div>}
    <div className="home-modules-list">
      {modules.map(module => <details key={module.id} open={!collapsed[module.id]}>
        <summary onClick={event => { event.preventDefault(); setCollapsed(current => ({ ...current, [module.id]: !current[module.id] })); }}><span>{module.name}</span><small>{module.items.length} {module.items.length === 1 ? "item" : "items"}</small></summary>
        <div>{module.items.length ? module.items.map(item => <div key={item.id} style={{ paddingInlineStart: `${Math.max(0, Math.min(Number(item.indent) || 0, 5)) * 16}px` }}>{renderItem(item)}</div>) : <p className="home-resource-empty">This module is empty.</p>}</div>
      </details>)}
      {!modules.length && <p className="home-resource-empty">No modules are available.</p>}
    </div>
  </>;
}
