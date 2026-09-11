const normalize = value => String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();

export function personRoles(person) {
  return [...new Set(person.enrollments?.length ? person.enrollments.map(enrollment => enrollment.role) : [person.role || "Participant"])];
}

export function filterPeople(people, query = "", role = "") {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return people.filter(person => {
    if (role && !personRoles(person).includes(role)) return false;
    const text = normalize([person.name, person.sortableName, person.shortName, person.pronouns, ...personRoles(person), ...(person.enrollments || []).map(enrollment => enrollment.sectionName)].filter(Boolean).join(" "));
    return terms.every(term => text.includes(term));
  }).sort((a, b) => (a.sortableName || a.name).localeCompare(b.sortableName || b.name, undefined, { sensitivity: "base", numeric: true }));
}

export function profileEnrollments(enrollments = []) {
  const courses = new Map();
  for (const enrollment of enrollments) {
    const key = enrollment.courseId ?? enrollment.courseName;
    if (!courses.has(key)) courses.set(key, { courseId: enrollment.courseId, courseName: enrollment.courseName, roles: [], sections: [] });
    const course = courses.get(key);
    course.roles.push(enrollment.role);
    if (enrollment.sectionName && !course.sections.includes(enrollment.sectionName)) course.sections.push(enrollment.sectionName);
  }
  return [...courses.values()];
}
