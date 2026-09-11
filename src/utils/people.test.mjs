import test from "node:test";
import assert from "node:assert/strict";
import { mapCoursePerson, loadCoursePerson, enrollmentRole } from "../../supabase/functions/canvas/coursePeople.ts";
import { filterPeople, profileEnrollments } from "./people.js";
import { canvasLinkNavigation } from "./canvasLinks.js";

const course = { id: 39, name: "F26-PHYS 009L 01" };
const sections = [{ id: 11, name: "Phys9L" }, { id: 12, name: "W-Phys9L-14-Keshab-4:30pm" }];
const user = { id: 2, name: "Nadine Abouelseoud", sortable_name: "Abouelseoud, Nadine", pronouns: "She/Her/Hers", avatar_url: "https://canvas.example/avatar/2", enrollments: [{ id: 1, course_id: 39, course_section_id: 11, type: "StudentEnrollment" }, { id: 2, course_id: 39, course_section_id: 12, type: "StudentEnrollment" }] };

test("People preserves photos, pronouns and every section/role pairing without grades or login identifiers", () => {
  const mapped = mapCoursePerson({ ...user, login_id: "private", sis_user_id: "private" }, sections, course);
  assert.equal(mapped.avatarUrl, user.avatar_url);
  assert.equal(mapped.pronouns, "She/Her/Hers");
  assert.deepEqual(mapped.enrollments.map(enrollment => [enrollment.sectionName, enrollment.role]), [["Phys9L", "Student"], ["W-Phys9L-14-Keshab-4:30pm", "Student"]]);
  assert.equal(mapped.login_id, undefined);
  assert.equal(enrollmentRole({ type: "TaEnrollment", role: "Lab assistant" }), "Lab assistant");
  assert.equal(enrollmentRole({ type: "student" }), "Student");
  assert.equal(mapCoursePerson({ id: 3, name: "Student", avatar_url: "javascript:alert(1)" }).avatarUrl, null);
});

test("search covers every person and section, combines filters, and uses Canvas sortable names", () => {
  const people = [mapCoursePerson({ id: 1, name: "Alice Zebra", sortable_name: "Zebra, Alice", enrollments: [{ type: "TeacherEnrollment" }] }), mapCoursePerson(user, sections, course), mapCoursePerson({ id: 3, name: "Émile Abbot", sortable_name: "Abbot, Émile", enrollments: [{ type: "TaEnrollment" }] })];
  assert.deepEqual(filterPeople(people).map(person => person.id), [3, 2, 1]);
  assert.deepEqual(filterPeople(people, "NADINE keshab", "Student").map(person => person.id), [2]);
  assert.equal(filterPeople(people, "Nadine", "Teacher").length, 0);
  assert.deepEqual(filterPeople(people, "emile").map(person => person.id), [3]);
  assert.equal(filterPeople(people, "does not exist").length, 0);
});

test("profiles request full Canvas details and do not mistake multiple sections for different courses", async () => {
  const calls = [];
  const request = async path => { calls.push(path); return path.includes("/users/") ? user : course; };
  const optionalRequest = async path => { calls.push(path); return { id: 2, name: user.name, pronunciation: "Na-deen", bio: "My biography", primary_email: "nadine@example.edu", links: [{ title: "Portfolio", url: "https://example.edu/me" }, { title: "Bad", url: "javascript:alert(1)" }], user_services: [{ service: "Website", service_user_link: "https://example.edu/contact" }] }; };
  const optionalList = async path => { calls.push(path); return path.includes("sections") ? sections : [{ ...course, enrollments: user.enrollments }, { id: 40, name: "Placement Exam: Chemistry", enrollments: [{ type: "StudentEnrollment" }] }]; };
  const person = await loadCoursePerson(39, 2, request, optionalRequest, optionalList);
  assert.match(calls[0], /courses\/39\/users\/2\?include\[\]=enrollments&include\[\]=avatar_url/);
  assert.ok(calls.some(path => path.includes("profile?include[]=links&include[]=user_services")));
  assert.equal(person.pronunciation, "Na-deen");
  assert.equal(person.avatarUrl, user.avatar_url);
  assert.equal(person.email, "nadine@example.edu");
  assert.equal(person.bio, "My biography");
  assert.equal(person.links.length, 1);
  assert.equal(person.services[0].url, "https://example.edu/contact");
  assert.deepEqual(profileEnrollments(person.enrollments).map(course => [course.courseName, course.roles]), [["F26-PHYS 009L 01", ["Student", "Student"]], ["Placement Exam: Chemistry", ["Student"]]]);
});

test("profile permissions are distinct from empty fields and membership is checked first", async () => {
  const person = await loadCoursePerson(39, 2, async path => path.includes("/users/") ? user : course, async () => null, async () => []);
  assert.equal(person.profileAvailable, false);
  assert.equal(person.name, user.name);
  assert.equal(person.enrollments.length, 2);
  let otherRequest = false;
  await assert.rejects(loadCoursePerson(39, 9, async () => { throw new Error("Not in course"); }, async () => { otherRequest = true; }, async () => { otherRequest = true; }), /Not in course/);
  assert.equal(otherRequest, false);
});

test("student profiles include Canvas's shared courses even when the full user course list is restricted", async () => {
  const person = await loadCoursePerson(39, 2,
    async path => path.includes("/users/") ? user : course,
    async path => path.includes("/profile?") ? { id: 2, name: user.name } : { id: 40, name: "Placement Exam: Chemistry" },
    async path => path.includes("/search/recipients?") ? [{ id: 2, common_courses: { 39: ["StudentEnrollment"], 40: ["StudentEnrollment"] } }] : [],
  );
  assert.deepEqual(profileEnrollments(person.enrollments).map(course => course.courseName), ["F26-PHYS 009L 01", "Placement Exam: Chemistry"]);
  assert.equal(person.enrollments.length, 3);
});

test("profile links use the correct person and course without leaving Moofie", () => {
  const patch = canvasLinkNavigation("/courses/39/users/2", "https://catcourses.ucmerced.edu/courses/39");
  assert.equal(patch.moofieViewer.type, "person");
  assert.equal(patch.moofieViewer.item.id, "2");
  assert.equal(patch.moofieHomeSection, "course-people");
  assert.equal(patch.moofieViewer.courseId, 39);
});
