import test from "node:test";
import assert from "node:assert/strict";
import { buildCourseNavigation } from "./courseNavigation.js";

test("preserves Canvas order except the three tabs the user removed", () => {
  const labels = ["Home", "Modules", "Announcements", "Assignments", "Files", "Grades", "Pages", "People", "Macmillan Learning", "Mid/Final Grades", "Quizzes", "Course Evaluations", "Discussions", "Chat", "YuJa Panorama", "Resources & Policy"];
  const tabs = labels.map((label, index) => ({
    id: label.includes(" ") || label.includes("/") ? `context_external_tool_${index}` : label.toLowerCase(),
    label,
    htmlUrl: `https://canvas.example.edu/courses/9/external_tools/${index}`,
  }));
  const result = buildCourseNavigation(tabs);
  assert.deepEqual(result.map(tab => tab.label), labels.filter(label => !["Chat", "Course Evaluations", "YuJa Panorama"].includes(label)));
  for (const label of ["Macmillan Learning", "Mid/Final Grades", "Resources & Policy"]) {
    const tab = result.find(tab => tab.label === label);
    assert.equal(tab.section, null);
    assert.equal(tab.htmlUrl, tabs.find(item => item.label === label).htmlUrl);
  }
  assert.equal(result.find(tab => tab.id === "people").section, "course-people");
  assert.equal(result.find(tab => tab.id === "discussions").section, "course-discussions");
});

test("keeps distinct destinations with similar names and removes duplicate IDs only", () => {
  const tabs = [
    { id: "home", label: "Home" },
    { id: "syllabus", label: "Syllabus", htmlUrl: "https://canvas.example.edu/syllabus" },
    { id: "context_external_tool_1", label: "Grades", type: "external" },
    { id: "grades", label: "Grades" },
    { id: "grades", label: "Grades" },
  ];
  const result = buildCourseNavigation(tabs);
  assert.equal(result.length, 4);
  assert.equal(result[2].section, null);
  assert.equal(result[3].section, "course-grades");
});

test("fallback includes People and Discussions without inventing course-specific tools", () => {
  const result = buildCourseNavigation([]);
  assert.ok(result.some(tab => tab.id === "people"));
  assert.ok(result.some(tab => tab.id === "discussions"));
  assert.ok(result.every(tab => tab.section));
});

test("Canvas tool URLs stay in Moofie; only off-site destinations are outgoing links", () => {
  const base = "https://canvas.example.edu/courses/9";
  const result = buildCourseNavigation([
    { id: "context_external_tool_42", label: "Mid/Final Grades", type: "external", htmlUrl: `${base}/external_tools/42` },
    { id: "custom_page", htmlUrl: `${base}/pages/resources-and-policy` },
    { id: "custom_file", htmlUrl: `${base}/files/123` },
    { id: "custom_assignment", htmlUrl: `${base}/assignments/456` },
    { id: "website", htmlUrl: "https://publisher.example.edu/achieve" },
    { id: "bad", htmlUrl: "javascript:alert(1)" },
  ], base);
  assert.deepEqual(result.map(tab => tab.destination?.kind), ["tool", "pages", "files", "assignments", "external", undefined]);
  assert.equal(result[0].destination.toolId, "42");
  assert.equal(result[0].navigationKey, "course-tab-context_external_tool_42");
  assert.equal(result[1].destination.id, "resources-and-policy");
  assert.equal(result[1].destination.courseId, 9);
});

test("Canvas reserved routes never become fake assignments or files", () => {
  const base = "https://canvas.example.edu/courses/9";
  const paths = ["assignments/syllabus", "assignments/new", "assignments/123", "files/folder", "files/456/download", "pages/assignments", "quizzes/789", "discussion_topics/321"];
  const tabs = buildCourseNavigation(paths.map((path, index) => ({ id: `custom-${index}`, label: "Any instructor label", htmlUrl: `${base}/${path}` })), base);
  assert.equal(tabs[0].section, "course-syllabus");
  assert.equal(tabs[0].navigationKey, "course-syllabus");
  assert.equal(tabs[1].destination, null);
  assert.deepEqual(tabs[2].destination, { kind: "assignments", courseId: 9, id: "123" });
  assert.equal(tabs[3].destination, null);
  assert.equal(tabs[4].destination.kind, "files");
  assert.equal(tabs[5].destination.kind, "pages");
  assert.equal(tabs[6].destination.kind, "quizzes");
  assert.equal(tabs[7].destination.kind, "discussion_topics");
});

test("CRES exclusions do not remove Course Resources or Zoom from other courses", () => {
  const tabs = ["Home", "Course Resources", "Zoom", "BigBlueButton", "Collaborations", "Pages"].map(label => ({ id: label.toLowerCase().replaceAll(" ", "_"), label }));
  assert.deepEqual(buildCourseNavigation(tabs, undefined, "F26-CRES 001 01").map(tab => tab.label), ["Home", "Pages"]);
  assert.deepEqual(buildCourseNavigation(tabs, undefined, "PHYS 009").map(tab => tab.label), ["Home", "Course Resources", "Zoom", "Pages"]);
});

test("every CatCourses course gets exactly one native policy tool for its own course", () => {
  for (const courseId of [39041, 39047, 12345]) {
    const base = `https://catcourses.ucmerced.edu/courses/${courseId}`;
    const result = buildCourseNavigation([{ id: "home", label: "Home" }], base);
    const policy = result.find(tab => tab.label === "Resources & Policy");
    assert.equal(policy.htmlUrl, `${base}/external_tools/1282`);
    assert.equal(policy.destination.kind, "tool");
    assert.equal(policy.destination.toolId, "1282");
    assert.equal(buildCourseNavigation(result, base).filter(tab => tab.label === "Resources & Policy").length, 1);
  }
  assert.ok(!buildCourseNavigation([], "https://another-university.edu/courses/9").some(tab => tab.label === "Resources & Policy"));
});
