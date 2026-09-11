import { useHistoryState, writeNavigation } from "../utils/navigation";
import { formatDueDate, formatPoints } from "../utils/gradebook";
import { assignmentCategories, assignmentCategory } from "../utils/assignmentOrder";

function ItemIcon({ folder = false }) {
  return <svg className="course-list-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">{folder ? <><path d="M3 6V3h7l3 3" /><path d="M3 8h18v13H3Z" fill="currentColor" /></> : <><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6" /></>}</svg>;
}

export function CourseAssignments({ assignments, onOpen }) {
  const now = Date.now();
  const groups = assignmentCategories.map(name => [name, assignments.filter(item => assignmentCategory(item, now) === name)]);
  if (!assignments.length) return <p className="home-resource-empty">No assignments.</p>;
  return <div className="canvas-assignment-groups">{groups.filter(([, items]) => items.length).map(([name, items]) =>
    <details className="canvas-assignment-group" key={name} open>
      <summary>{name}<span>{items.length}</span></summary>
      {items.map(assignment => {
        const metadata = [];
        if (assignment.unlockAt && new Date(assignment.unlockAt).getTime() > now) metadata.push(`Not available until ${formatDueDate(assignment.unlockAt)}`);
        else if (assignment.lockAt && new Date(assignment.lockAt).getTime() < now) metadata.push("Closed");
        if (assignment.dueAt && Number.isFinite(new Date(assignment.dueAt).getTime())) metadata.push(`Due ${formatDueDate(assignment.dueAt)}`);
        if (assignment.points != null) metadata.push(`${assignment.earned == null ? "–" : formatPoints(assignment.earned)}/${formatPoints(assignment.points)} pts`);
        if (assignment.excused) metadata.push("Excused");
        else if (assignment.missing) metadata.push("Missing");
        else if (assignment.submitted && assignment.earned == null) metadata.push("Not Yet Graded");
        else if (String(assignment.grade || "").endsWith("%")) metadata.push(assignment.grade);
        if (assignment.late) metadata.push("Late");
        return <button className="canvas-assignment-row" key={assignment.id} onClick={() => onOpen(assignment)} type="button">
          <ItemIcon /><span className="canvas-assignment-copy"><strong>{assignment.title}</strong><span className="canvas-assignment-meta">{metadata.map((item, index) => <span key={index}>{item}</span>)}</span></span>
        </button>;
      })}
    </details>
  )}</div>;
}

function date(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return "–";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
function size(bytes) {
  if (bytes == null) return "–";
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function CourseFiles({ files, folders = [], onOpen }) {
  const [folderId] = useHistoryState("moofieFileFolder", null);
  const [query, setQuery] = useHistoryState("moofieFileQuery", "");
  const [sort, setSort] = useHistoryState("moofieFileSort", { key: "name", ascending: true });
  const root = folders.find(folder => folder.parentId == null);
  const currentId = folderId ?? root?.id ?? null;
  const current = folders.find(folder => String(folder.id) === String(currentId));
  const trail = [];
  const seen = new Set();
  let ancestor = current;
  while (ancestor && ancestor !== root && !seen.has(ancestor.id)) {
    seen.add(ancestor.id);
    trail.unshift(ancestor);
    ancestor = folders.find(folder => String(folder.id) === String(ancestor.parentId));
  }
  const search = query.trim().toLowerCase();
  const rows = [
    ...folders.filter(folder => folder !== root && (search ? folder.name.toLowerCase().includes(search) : String(folder.parentId) === String(currentId) || (folderId == null && !folders.some(parent => String(parent.id) === String(folder.parentId))))).map(folder => ({ ...folder, kind: "folder" })),
    ...files.filter(file => search ? file.name.toLowerCase().includes(search) : !folders.length || String(file.folderId) === String(currentId) || (folderId == null && !folders.some(folder => String(folder.id) === String(file.folderId)))).map(file => ({ ...file, kind: "file" })),
  ].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    const comparison = sort.key === "name" ? a.name.localeCompare(b.name, undefined, { numeric: true }) : sort.key === "size" ? (a.size || 0) - (b.size || 0) : (new Date(a[sort.key]).getTime() || 0) - (new Date(b[sort.key]).getTime() || 0);
    return sort.ascending ? comparison : -comparison;
  });
  function navigate(id) {
    if (String(id) === String(folderId) && !query) return;
    writeNavigation({ moofieFileFolder: id, moofieFileQuery: "" });
  }
  return <div className="course-file-browser">
    <label className="file-search">Search files<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search files and folders…" /></label>
    {trail.length > 0 && <nav className="file-breadcrumbs" aria-label="File folders"><button type="button" onClick={() => navigate(null)}>All files</button>{trail.map(folder => <span key={folder.id}><span aria-hidden="true"> / </span><button type="button" onClick={() => navigate(folder.id)}>{folder.name}</button></span>)}</nav>}
    {search && <p className="file-search-status" role="status">{rows.length} results across this course</p>}
    <div className="file-table-scroll"><table className="course-file-table"><thead><tr>{[["name", "Name"], ["createdAt", "Created"], ["updatedAt", "Last modified"], ["size", "Size"]].map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? sort.ascending ? "ascending" : "descending" : "none"}><button type="button" onClick={() => setSort({ key, ascending: sort.key === key ? !sort.ascending : true })}>{label}{sort.key === key && <span aria-hidden="true"> {sort.ascending ? "↑" : "↓"}</span>}</button></th>)}<th scope="col">Status</th></tr></thead>
      <tbody>{rows.map(item => <tr key={`${item.kind}-${item.id}`}><td><button className="file-name-button" type="button" disabled={item.locked} onClick={() => item.kind === "folder" ? navigate(item.id) : onOpen(item)}><ItemIcon folder={item.kind === "folder"} /><span>{item.name}</span></button></td><td>{date(item.createdAt)}</td><td>{date(item.updatedAt)}</td><td>{item.kind === "folder" ? "–" : size(item.size)}</td><td>{item.locked ? "Locked" : item.kind === "file" && (item.url || item.previewUrl) ? <a href={item.url || item.previewUrl} download={item.name} target="_blank" rel="noreferrer">Download</a> : "–"}</td></tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="home-resource-empty">{search ? "No files or folders match your search." : "This folder is empty."}</p>}
    {rows.length > 0 && <p className="file-table-count">{rows.length} {rows.length === 1 ? "item" : "items"}</p>}
  </div>;
}
