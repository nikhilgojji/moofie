type CanvasRecord = Record<string, any>;

function profileLink(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function enrollmentRole(enrollment: CanvasRecord) {
  const role = enrollment.role || enrollment.type || "Participant";
  return ({ StudentEnrollment: "Student", TeacherEnrollment: "Teacher", TaEnrollment: "TA", DesignerEnrollment: "Designer", ObserverEnrollment: "Observer", StudentViewEnrollment: "Test Student", student: "Student", teacher: "Teacher", ta: "TA", designer: "Designer", observer: "Observer" } as Record<string, string>)[role] || role;
}

export function mapCoursePerson(person: CanvasRecord, sections: CanvasRecord[] = [], course: CanvasRecord = {}) {
  const enrollments = (person.enrollments || []).map((enrollment: CanvasRecord) => ({
    id: enrollment.id ?? null,
    courseId: enrollment.course_id ?? course.id ?? null,
    courseName: course.name || course.course_code || null,
    sectionId: enrollment.course_section_id ?? null,
    sectionName: sections.find(section => String(section.id) === String(enrollment.course_section_id))?.name || enrollment.section?.name || null,
    role: enrollmentRole(enrollment),
    state: enrollment.enrollment_state || null,
  }));
  return {
    id: person.id,
    name: person.name || person.short_name || "Participant",
    sortableName: person.sortable_name || person.name || person.short_name || "Participant",
    shortName: person.short_name || null,
    pronouns: person.pronouns || null,
    avatarUrl: profileLink(person.avatar_url),
    role: enrollments[0]?.role || "Participant",
    enrollments,
  };
}

// Check membership through the course endpoint before loading a user's profile.
// Every request uses the caller's Canvas token and respects Canvas visibility.
export async function loadCoursePerson(
  courseId: number,
  personId: number,
  request: (path: string) => Promise<any>,
  optionalRequest: (path: string) => Promise<any>,
  optionalList: (path: string) => Promise<any[]>,
) {
  const person = await request(`/api/v1/courses/${courseId}/users/${personId}?include[]=enrollments&include[]=avatar_url`);
  const [profile, sections, course, courses, recipients] = await Promise.all([
    optionalRequest(`/api/v1/users/${personId}/profile?include[]=links&include[]=user_services`),
    optionalList(`/api/v1/courses/${courseId}/sections?per_page=100`),
    request(`/api/v1/courses/${courseId}`),
    optionalList(`/api/v1/users/${personId}/courses?per_page=100`),
    optionalList(`/api/v1/search/recipients?user_id=${personId}&per_page=100`),
  ]);
  const mapped = mapCoursePerson({ ...person, ...profile, enrollments: person.enrollments }, sections, course);
  // The user-courses endpoint supplies enrollments belonging to the requested
  // person. Never substitute the signed-in user's dashboard enrollments.
  const enrollments = [...mapped.enrollments];
  for (const otherCourse of courses) {
    if (Number(otherCourse.id) === courseId) continue;
    for (const enrollment of otherCourse.enrollments || []) {
      enrollments.push({ id: enrollment.id ?? null, courseId: otherCourse.id, courseName: otherCourse.name || otherCourse.course_code || null, sectionId: null, sectionName: null, role: enrollmentRole(enrollment), state: enrollment.enrollment_state || null });
    }
  }
  // Canvas's profile also shows shared enrollments. The recipient lookup is
  // read-only and exposes those shared courses even when the person's complete
  // course list is unavailable (the usual student permission level).
  const shared = recipients.find(recipient => Number(recipient.id) === personId)?.common_courses || {};
  const sharedIds = Object.keys(shared).filter(id => /^[1-9]\d*$/.test(id) && !enrollments.some(enrollment => Number(enrollment.courseId) === Number(id)));
  const sharedCourses: CanvasRecord[] = new Array(sharedIds.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, sharedIds.length) }, async () => {
    while (next < sharedIds.length) {
      const index = next++;
      sharedCourses[index] = await optionalRequest(`/api/v1/courses/${sharedIds[index]}`);
    }
  }));
  sharedIds.forEach((id, index) => {
    const sharedCourse = sharedCourses[index];
    if (!sharedCourse || !Array.isArray(shared[id])) return;
    for (const type of shared[id]) {
      enrollments.push({ id: null, courseId: Number(id), courseName: sharedCourse.name || sharedCourse.course_code || null, sectionId: null, sectionName: null, role: enrollmentRole({ type }), state: null });
    }
  });
  return {
    ...mapped,
    profileAvailable: Boolean(profile),
    title: profile?.title || null,
    pronunciation: profile?.pronunciation || null,
    bio: profile?.bio ?? person.bio ?? null,
    email: profile?.primary_email || null,
    links: (profile?.links || []).map((link: CanvasRecord) => ({ title: link.title || link.url, url: profileLink(link.url) })).filter((link: CanvasRecord) => link.url),
    services: (profile?.user_services || []).map((service: CanvasRecord) => ({ name: service.service_name || service.service || service.name || "Contact", url: profileLink(service.service_user_link || service.service_user_url || service.url) })).filter((service: CanvasRecord) => service.url),
    enrollments,
  };
}
