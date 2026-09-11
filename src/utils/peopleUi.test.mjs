import test, { after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<div id="root"></div>', { url: "https://moofie.example" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const fixture = new URL(".people-ui.fixture.mjs", import.meta.url);
const bundle = await rolldown({
  input: "people-test-entry",
  external: id => /^react(?:\/|$)/.test(id),
  transform: { jsx: "react-jsx" },
  plugins: [{
    name: "people-test",
    resolveId(id) {
      if (id === "people-test-entry") return "\0people-test-entry";
      if (id.endsWith("/canvasApi")) return "\0people-test-api";
    },
    load(id) {
      if (id === "\0people-test-entry") return `export { CoursePeople } from ${JSON.stringify(fileURLToPath(new URL("../components/CoursePeople.jsx", import.meta.url)))}; export { CoursePerson } from ${JSON.stringify(fileURLToPath(new URL("../components/CoursePerson.jsx", import.meta.url)))}; export { CoursePeoplePanel } from ${JSON.stringify(fileURLToPath(new URL("../components/CoursePeoplePanel.jsx", import.meta.url)))};`;
      if (id === "\0people-test-api") return "export const loadCourseContent = (...args) => globalThis.peopleTestRequest(...args); export const loadCoursePeople = (...args) => globalThis.peopleTestRequest(...args); export const loadCourseFile = () => Promise.reject(new Error('Unexpected file request'));";
    },
  }],
});
const generated = await bundle.generate({ format: "esm" });
await writeFile(fixture, generated.output[0].code);
await bundle.close();
const { CoursePeople, CoursePerson, CoursePeoplePanel } = await import(fixture.href);
const root = createRoot(document.getElementById("root"));
after(async () => { await act(async () => root.unmount()); dom.window.close(); await unlink(fixture); delete globalThis.peopleTestRequest; });
const participant = { id: 2, name: "Nadine Abouelseoud", sortableName: "Abouelseoud, Nadine", pronouns: "She/Her/Hers", avatarUrl: "https://canvas.example/avatar/2", enrollments: [{ courseId: 39, courseName: "Physics", role: "Student", sectionName: "Phys9L" }, { courseId: 39, courseName: "Physics", role: "Student", sectionName: "Keshab 4:30pm" }] };
const profile = { ...participant, profileAvailable: true, pronunciation: "Na-deen", bio: "A real biography", email: "nadine@example.edu", services: [], links: [] };

test("People controls search all names and sections, filter roles, and open the clicked person", async () => {
  let opened;
  const people = [participant, { id: 3, name: "Instructor", enrollments: [{ role: "Teacher", sectionName: "Phys9L" }] }];
  await act(async () => root.render(createElement(CoursePeople, { people, onOpen: person => { opened = person; } })));
  const name = document.querySelector(".people-name");
  assert.match(name.textContent, /Nadine Abouelseoud.*She\/Her\/Hers/);
  assert.equal(name.querySelector("img").getAttribute("src"), participant.avatarUrl);
  assert.equal(name.closest("td").rowSpan, 2);
  await act(async () => name.click());
  assert.equal(opened.id, 2);
  const search = document.querySelector('input[type="search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(search, "keshab");
    search.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  assert.equal(document.querySelectorAll(".people-name").length, 1);
  const select = document.querySelector("select");
  await act(async () => { select.value = "Teacher"; select.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
  assert.match(document.body.textContent, /No people match your search/);
});

test("profile view displays details, keeps course links internal, and ignores a stale person response", async () => {
  let resolveFirst;
  globalThis.peopleTestRequest = () => new Promise(resolve => { resolveFirst = resolve; });
  await act(async () => root.render(createElement(CoursePerson, { courseId: 39, person: participant })));
  assert.ok(document.querySelector('[aria-label="Loading profile"]'));
  globalThis.peopleTestRequest = async () => ({ ...profile, id: 3, name: "Second Person", bio: "Second biography" });
  await act(async () => root.render(createElement(CoursePerson, { courseId: 39, person: { id: 3, name: "Second Person" } })));
  await act(async () => resolveFirst(profile));
  assert.match(document.querySelector(".profile-content").textContent, /Second Person/);
  assert.match(document.body.textContent, /Second biography/);
  assert.doesNotMatch(document.body.textContent, /A real biography/);
  assert.ok(document.querySelector('a[href="mailto:nadine@example.edu"]'));
  assert.equal(document.querySelectorAll('.profile-course-link').length, 1);
  assert.match(document.querySelector('.profile-course-link').textContent, /Student, Student in Physics/);
  assert.match(document.body.textContent, /No links have been added/);
});

test("profile errors can retry and a restricted profile is not presented as empty", async () => {
  globalThis.peopleTestRequest = async () => { throw new Error("Profile unavailable"); };
  await act(async () => root.render(createElement(CoursePerson, { courseId: 40, person: participant })));
  assert.match(document.querySelector('[role="alert"]').textContent, /Profile unavailable/);
  globalThis.peopleTestRequest = async () => ({ ...profile, profileAvailable: false, pronunciation: null, bio: null });
  await act(async () => document.querySelector('[role="alert"] button').click());
  assert.match(document.body.textContent, /full profile available to your account/);
  assert.match(document.body.textContent, /Biography is not available/);
  assert.doesNotMatch(document.body.textContent, /No biography has been added/);
});

test("rosters load on the People tab and remain available when revisiting it", async () => {
  let calls = 0;
  globalThis.peopleTestRequest = async () => { calls++; return { people: [participant] }; };
  const render = active => root.render(createElement(CoursePeoplePanel, { courseId: 39, active, people: null, onOpen() {} }));
  await act(async () => render(false));
  assert.equal(calls, 0);
  await act(async () => render(true));
  assert.equal(calls, 1);
  assert.match(document.body.textContent, /Nadine Abouelseoud/);
  await act(async () => render(false));
  await act(async () => render(true));
  assert.equal(calls, 1);
});
