import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { closedContent, readNavigation, writeNavigation } from "./navigation.js";

beforeEach(() => {
  const events = new EventTarget();
  const entries = [{ moofieView: "home" }];
  let index = 0;
  globalThis.window = {
    scrollY: 0,
    scrollTo({ top }) { this.scrollY = top; },
    dispatchEvent: event => events.dispatchEvent(event),
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
    history: {
      get state() { return entries[index]; },
      get length() { return entries.length; },
      replaceState(state) { entries[index] = structuredClone(state); },
      pushState(state) { entries.splice(index + 1); entries.push(structuredClone(state)); index++; },
      back() { if (index > 0) { index--; window.dispatchEvent(new Event("popstate")); } },
      forward() { if (index < entries.length - 1) { index++; window.dispatchEvent(new Event("popstate")); } },
    },
  };
});

function course() {
  writeNavigation({ ...closedContent, moofieView: "home", moofieHomeCourse: 42, moofieHomeSection: "course-modules" });
}

test("Back visits tabs and the course before Home; Forward reverses the path", () => {
  course();
  writeNavigation({ moofieHomeSection: "course-assignments" });
  writeNavigation({ moofieHomeSection: "course-files" });
  window.history.back();
  assert.equal(readNavigation().moofieHomeSection, "course-assignments");
  window.history.back();
  assert.equal(readNavigation().moofieHomeSection, "course-modules");
  assert.equal(readNavigation().moofieHomeCourse, 42);
  window.history.back();
  assert.equal(readNavigation().moofieHomeCourse, undefined);
  window.history.forward();
  assert.equal(readNavigation().moofieHomeCourse, 42);
});

test("nested folders and file previews preserve their own entries", () => {
  course();
  writeNavigation({ moofieHomeSection: "course-files" });
  writeNavigation({ moofieFileFolder: 10 });
  writeNavigation({ moofieFileFolder: 11 });
  const viewer = { type: "file", courseId: 42, item: { id: 5, name: "Lecture.pdf" } };
  writeNavigation({ moofieViewer: viewer });
  window.history.back();
  assert.equal(readNavigation().moofieFileFolder, 11);
  assert.equal(readNavigation().moofieViewer, null);
  window.history.back();
  assert.equal(readNavigation().moofieFileFolder, 10);
  window.history.forward();
  window.history.forward();
  assert.deepEqual(readNavigation().moofieViewer, viewer);
});

test("navigation out of a viewer keeps it available through Back", () => {
  course();
  const viewer = { type: "assignment", courseId: 42, item: { id: 7 } };
  writeNavigation({ moofieViewer: viewer });
  writeNavigation({ ...closedContent, moofieHomeSection: "course-files" });
  assert.equal(readNavigation().moofieViewer, null);
  window.history.back();
  assert.deepEqual(readNavigation().moofieViewer, viewer);
});

test("grades and grade assignments restore their course context", () => {
  course();
  writeNavigation({ ...closedContent, moofieView: "grades", moofieCourse: null });
  writeNavigation({ moofieGradeFilter: "upcoming" }, { replace: true });
  writeNavigation({ ...closedContent, moofieCourse: 73 });
  writeNavigation({ moofieCourseAssignment: { id: 8 } });
  window.history.back();
  assert.equal(readNavigation().moofieCourse, 73);
  window.history.back();
  assert.equal(readNavigation().moofieCourse, null);
  assert.equal(readNavigation().moofieGradeFilter, "upcoming");
  window.history.back();
  assert.equal(readNavigation().moofieView, "home");
  assert.equal(readNavigation().moofieHomeCourse, 42);
});

test("search, sorting and loaded content replace only the current entry", () => {
  course();
  writeNavigation({ moofieFileFolder: 10 });
  const length = window.history.length;
  const id = readNavigation().moofieEntryId;
  writeNavigation({ moofieFileQuery: "lecture", moofieFileSort: { key: "updatedAt", ascending: false } }, { replace: true });
  assert.equal(window.history.length, length);
  assert.equal(readNavigation().moofieEntryId, id);
  writeNavigation({ moofieViewer: { type: "page", item: { pageUrl: "intro" } } });
  const viewerId = readNavigation().moofieEntryId;
  writeNavigation({ moofieViewer: { type: "page", item: { pageUrl: "intro", body: "Loaded content" } } }, { replace: true });
  assert.equal(readNavigation().moofieEntryId, viewerId);
  window.history.back();
  assert.equal(readNavigation().moofieFileQuery, "lecture");
  assert.equal(readNavigation().moofieFileSort.key, "updatedAt");
  window.history.forward();
  assert.equal(readNavigation().moofieViewer.item.body, "Loaded content");
});

test("scroll position is attached to the entry being left", () => {
  course();
  window.scrollY = 630;
  writeNavigation({ moofieHomeSection: "course-files" });
  assert.equal(window.scrollY, 0);
  window.history.back();
  assert.equal(readNavigation().moofieScrollY, 630);
});

test("Pages restores front page, all-pages list, and opened page independently", () => {
  course();
  writeNavigation({ moofieHomeSection: "course-pages", moofiePagesIndex: false });
  writeNavigation({ moofiePagesIndex: true });
  writeNavigation({ moofieViewer: { type: "page", item: { pageUrl: "exam-2" } } });
  window.history.back();
  assert.equal(readNavigation().moofieViewer, null);
  assert.equal(readNavigation().moofiePagesIndex, true);
  window.history.back();
  assert.equal(readNavigation().moofiePagesIndex, false);
  window.history.forward();
  assert.equal(readNavigation().moofiePagesIndex, true);
});
