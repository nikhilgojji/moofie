import { mapCoursePerson } from "../../supabase/functions/canvas/coursePeople.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { courseContentSection } from "./courseHome.js";
import { canvasLinkNavigation } from "./canvasLinks.js";
import { completeModules, moduleExternalUrl } from "../../supabase/functions/canvas/courseModules.ts";
import { compareCanvasCollections, resourceSection } from "../../supabase/functions/canvas/courseAudit.ts";

test("all Canvas Home settings win over unrelated saved front-page and syllabus content", () => {
  const choices = { modules: "course-modules", wiki: "course-overview", assignments: "course-assignments", syllabus: "course-syllabus", feed: "course-activity" };
  for (const [defaultView, expected] of Object.entries(choices)) {
    assert.equal(courseContentSection("course-overview", { defaultView, homeBody: "Old front page", syllabusBody: "Existing syllabus" }), expected);
    assert.equal(courseContentSection("course-files", { defaultView }), "course-files");
  }
});

test("omitted and partial module lists are fetched, while complete and empty lists are retained", async () => {
  const requested = [];
  const modules = [
    { id: 3, position: 3, items_count: 2, items: [{ id: 31, position: 1 }] },
    { id: 1, position: 1, items_count: 1, items: null },
    { id: 2, position: 2, items_count: 1, items: [{ id: 21 }] },
    { id: 4, position: 4, items_count: 0, items: [] },
  ];
  const result = await completeModules(modules, async id => { requested.push(id); return id === 1 ? [{ id: 11 }] : [{ id: 32, position: 2 }, { id: 31, position: 1 }]; });
  assert.deepEqual(requested.sort(), [1, 3]);
  assert.deepEqual(result.map(module => module.id), [1, 2, 3, 4]);
  assert.deepEqual(result[2].items.map(item => item.id), [31, 32]);
  assert.equal(modules[0].items.length, 1);
  await assert.rejects(completeModules([{ id: 1 }], async () => { throw new Error("Canvas unavailable"); }), /Canvas unavailable/);
});

test("native Canvas links preserve the course and content identity without outgoing redirects", () => {
  const base = "https://catcourses.ucmerced.edu/courses/39041/pages/home";
  for (const [path, type] of [["pages/read-this", "page"], ["files/42/preview", "file"], ["assignments/42", "assignment"], ["quizzes/42", "quiz"], ["discussion_topics/42", "discussion"], ["external_tools/1282", "course-tool"]]) {
    const patch = canvasLinkNavigation(`/courses/39047/${path}`, base, "Read this");
    assert.equal(patch.moofieHomeCourse, 39047);
    assert.equal(patch.moofieView, "home");
    assert.equal(patch.moofieViewer.type, type);
    assert.equal(patch.moofieViewer.courseId, 39047);
  }
  assert.equal(canvasLinkNavigation("/courses/39041/assignments/syllabus", base).moofieHomeSection, "course-syllabus");
  assert.equal(canvasLinkNavigation("/files/42/download", base).moofieViewer.item.id, "42");
  assert.equal(canvasLinkNavigation("/api/v1/courses/39041/files/42", base).moofieViewer.type, "file");
  assert.equal(canvasLinkNavigation("/courses/39041/assignments/new", base), null);
  assert.equal(canvasLinkNavigation("https://external.example/page", base), null);
  assert.equal(canvasLinkNavigation("javascript:alert(1)", base), null);
  assert.equal(moduleExternalUrl("http://example.edu/steamplug", base), "http://example.edu/steamplug");
  assert.equal(moduleExternalUrl("javascript:alert(1)", base), null);
});

// Run the real course_resources mapping with API fixtures rather than manually
// constructing the frontend response; this catches data silently lost in transit.
const source = readFileSync(new URL("../../supabase/functions/canvas/index.ts", import.meta.url), "utf8");
const resourceCode = stripTypeScriptTypes(source.slice(source.indexOf("async function courseResources("), source.indexOf("async function coursePage(")));
test("course resource mapping carries Modules Home, full content and all accessible People", async () => {
  const requests = [];
  const request = async (_, path) => {
    if (path.includes("front_page")) return { title: "Unused front page", body: "Unused body", html_url: "https://catcourses.ucmerced.edu/courses/39041/pages/home" };
    if (path.includes("settings")) return { show_announcements_on_home_page: true, home_page_announcement_limit: 3 };
    return { name: "CSE 030 01", default_view: "modules", syllabus_body: "Unused syllabus" };
  };
  const list = async (_, path) => {
    requests.push(path);
    if (path.includes("/modules/7/items")) return [{ id: 71, title: "STEAMplug", type: "ExternalUrl", external_url: "http://example.edu/steamplug" }];
    if (path.includes("/modules?")) return [{ id: 7, name: "STEAMplug", items_count: 1 }];
    if (path.includes("/users?")) return [{ id: 1, name: "Student", pronouns: "they/them", avatar_url: "https://canvas.example/avatar/1", enrollments: [{ type: "StudentEnrollment", course_section_id: 8 }] }, { id: 2, name: "Teacher", enrollments: [{ type: "TeacherEnrollment" }] }];
    if (path.includes("/sections?")) return [{ id: 8, name: "Lab Section 8" }];
    return [];
  };
  const safeLink = (value, base) => { try { return new URL(value, base).href; } catch { return null; } };
  const load = new Function("optionalCanvasRequest", "optionalCanvasList", "canvasList", "safeLink", "completeModules", "moduleExternalUrl", "mapCoursePerson", "compareCanvasCollections", "resourceSection", resourceCode + "\nreturn courseResources;")(request, list, list, safeLink, completeModules, moduleExternalUrl, mapCoursePerson, compareCanvasCollections, resourceSection);
  const result = await load("https://catcourses.ucmerced.edu", "fixture-token", 39041);
  assert.equal(courseContentSection("course-overview", result.course), "course-modules");
  assert.equal(result.modules[0].items[0].title, "STEAMplug");
  assert.equal(result.modules[0].items[0].externalUrl, "http://example.edu/steamplug");
  assert.equal(result.course.homeTitle, "Unused front page");
  assert.equal(result.course.homeAnnouncementLimit, 3);
  assert.equal(result.people.length, 2);
  assert.equal(result.people[0].avatarUrl, "https://canvas.example/avatar/1");
  assert.equal(result.people[0].pronouns, "they/them");
  assert.equal(result.people[0].enrollments[0].sectionName, "Lab Section 8");
  assert.ok(requests.some(path => path.includes("/users?") && path.includes("include[]=avatar_url")));
  assert.ok(!requests.some(path => path.includes("enrollment_type")));
  requests.length = 0;
  const fast = await load("https://catcourses.ucmerced.edu", "fixture-token", 39041, false);
  assert.equal(fast.people, null);
  assert.equal(fast.modules[0].items[0].title, "STEAMplug");
  assert.ok(!requests.some(path => /\/(users|sections)\?/.test(path)), "Home does not wait for the full roster");
});
