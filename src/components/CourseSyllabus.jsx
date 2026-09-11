import { useRef } from "react";

export function CourseSyllabus({ assignments = [], events = [], onOpen, children }) {
  const todayRef = useRef(null);
  const rows = [
    ...assignments.map(item => ({ key: `assignment-${item.id}`, title: item.title, date: item.dueAt, item, kind: "assignment" })),
    ...events.map(item => ({ key: `event-${item.id}`, title: item.title, date: item.startAt, item, kind: "event" })),
  ].sort((a, b) => {
    const time = row => row.date && Number.isFinite(Date.parse(row.date)) ? Date.parse(row.date) : Infinity;
    const difference = time(a) - time(b);
    return Number.isFinite(difference) && difference !== 0 ? difference : time(a) !== time(b) ? time(a) < time(b) ? -1 : 1 : a.title.localeCompare(b.title);
  });
  const groups = [];
  for (const row of rows) {
    const date = row.date && Number.isFinite(Date.parse(row.date)) ? new Date(row.date) : null;
    const key = date ? date.toDateString() : "undated";
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = { key, date, rows: [] };
      groups.push(group);
    }
    group.rows.push(row);
  }
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const todayKey = rows.find(row => row.date && Date.parse(row.date) >= startOfToday)?.key;
  return <>
    {children}
    <div className="syllabus-summary-heading"><h3>Course Summary</h3><button type="button" disabled={!todayKey} onClick={() => todayRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>Jump to Today</button></div>
    <div className="file-table-scroll syllabus-table-wrap"><table className="syllabus-summary" aria-label="Course summary">
      <colgroup><col className="syllabus-date-column" /><col /><col className="syllabus-due-column" /></colgroup>
      <thead><tr><th scope="col">Date</th><th scope="col">Details</th><th scope="col">Due</th></tr></thead>
      {groups.map(group => <tbody key={group.key}>
        {group.rows.map((row, index) => <tr key={row.key} ref={row.key === todayKey ? todayRef : undefined}>
          {index === 0 && <th className="syllabus-date" scope="rowgroup" rowSpan={group.rows.length} aria-label={group.date ? undefined : "Undated assignments"}>{group.date?.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</th>}
          <td className="syllabus-details"><button type="button" onClick={() => onOpen(row.kind, row.item)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6" /></svg>
            <span>{row.title}</span>
          </button></td>
          <td className="syllabus-due">{group.date ? `${row.kind === "assignment" ? "due by" : "at"} ${new Date(row.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}</td>
        </tr>)}
      </tbody>)}
      {!rows.length && <tbody><tr><td colSpan={3} className="syllabus-empty">No course summary items have been published.</td></tr></tbody>}
    </table></div>
  </>;
}
