import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readNavigation, writeNavigation } from "./navigation.js";

beforeEach(() => {
  const events = new EventTarget();
  const entries = [{ moofieView: "grades" }];
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


test("grade courses and filters survive Back and Forward", () => {
  writeNavigation({ moofieGradeFilter: "upcoming" }, { replace: true });
  writeNavigation({ moofieCourse: 42 });
  writeNavigation({ moofieCourse: null });
  window.history.back();
  assert.equal(readNavigation().moofieCourse, 42);
  window.history.back();
  assert.equal(readNavigation().moofieCourse, null);
  assert.equal(readNavigation().moofieGradeFilter, "upcoming");
  window.history.forward();
  assert.equal(readNavigation().moofieCourse, 42);
});
test("legacy Home and viewer history cannot reopen removed features", () => {
  window.history.replaceState({ moofieView: "home", moofieCourse: 42, moofieHomeCourse: 42, moofieViewer: { type: "quiz" } });
  writeNavigation({}, { replace: true });
  assert.equal(window.history.state.moofieView, "grades");
  assert.equal(window.history.state.moofieCourse, null);
  assert.equal("moofieHomeCourse" in window.history.state, false);
  assert.equal("moofieViewer" in window.history.state, false);
});
test("course navigation preserves the previous grade-list scroll position", () => {
  window.scrollY = 630;
  writeNavigation({ moofieCourse: 42 });
  assert.equal(window.scrollY, 0);
  window.history.back();
  assert.equal(readNavigation().moofieScrollY, 630);
});
