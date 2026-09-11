import { useMemo, useState } from "react";
import { CourseAvatar } from "./CourseAvatar";
import { filterPeople, personRoles } from "../utils/people";

export function CoursePeople({ people = [], onOpen }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const roles = useMemo(() => [...new Set(people.flatMap(personRoles))].sort(), [people]);
  const filtered = useMemo(() => filterPeople(people, query, role), [people, query, role]);
  return <div className="course-people">
    <div className="people-controls">
      <input type="search" aria-label="Search people" placeholder="Search people" value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="Filter people by role" value={role} onChange={event => setRole(event.target.value)}><option value="">All Roles</option>{roles.map(value => <option key={value} value={value}>{value}</option>)}</select>
      <span className="people-count" role="status">{filtered.length} {filtered.length === 1 ? "person" : "people"}{query || role ? ` of ${people.length}` : ""}</span>
    </div>
    <div className="people-table-scroll">
      <table className="course-people-table">
        <caption className="skeleton-accessible-label">Course participants, sections and roles</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Section</th><th scope="col">Role</th></tr></thead>
        <tbody>{filtered.flatMap((person, personIndex) => {
          const enrollments = person.enrollments?.length ? person.enrollments : [{ role: person.role || "Participant", sectionName: null }];
          return enrollments.map((enrollment, index) => <tr className={`people-row ${personIndex % 2 === 0 ? "is-striped" : ""} ${index === enrollments.length - 1 ? "is-last-enrollment" : ""}`} key={`${person.id}:${index}`}>
            {index === 0 && <td rowSpan={enrollments.length} className="people-name-cell"><button type="button" className="people-name" onClick={() => onOpen(person)}><CourseAvatar className="people-avatar" src={person.avatarUrl} name={person.name} /><span>{person.name}{person.pronouns && <em> ({person.pronouns})</em>}</span></button></td>}
            <td>{enrollment.sectionName || <span aria-label="Section not provided">—</span>}</td><td>{enrollment.role}</td>
          </tr>);
        })}</tbody>
      </table>
    </div>
    {!filtered.length && <p className="home-resource-empty">{query || role ? "No people match your search." : "No people are available to view in this course."}</p>}
  </div>;
}
