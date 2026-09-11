import { useEffect, useState } from "react";

const NAVIGATION_EVENT = "moofie:navigation";
export const closedContent = {
  moofieViewer: null,
  moofieGradeAssignment: null,
  moofieCourseAssignment: null,
};

export function readNavigation() {
  return typeof window === "undefined" ? {} : window.history.state || {};
}

// Each visited screen owns its state. Replacing is reserved for edits within a
// screen (search, sorting, loaded content), not navigation to another screen.
export function writeNavigation(patch, { replace = false } = {}) {
  const current = readNavigation();
  if (replace) {
    window.history.replaceState({ ...current, ...patch }, "");
  } else {
    window.history.replaceState({ ...current, moofieScrollY: window.scrollY }, "");
    window.history.pushState({
      ...current,
      ...patch,
      moofieEntryId: crypto.randomUUID(),
      moofieScrollY: 0,
      moofieContentScrollY: 0,
    }, "");
  }
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
  if (!replace) window.scrollTo({ top: 0, behavior: "instant" });
}

export function useHistoryState(key, fallback, push = false) {
  const getValue = () => readNavigation()[key] ?? fallback;
  const [value, setValue] = useState(getValue);
  useEffect(() => {
    const restore = () => setValue(getValue());
    window.addEventListener("popstate", restore);
    window.addEventListener(NAVIGATION_EVENT, restore);
    restore();
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener(NAVIGATION_EVENT, restore);
    };
  }, [key]);
  function update(next, options = {}) {
    const resolved = typeof next === "function" ? next(getValue()) : next;
    if (Object.is(resolved, getValue())) return;
    writeNavigation({ [key]: resolved }, { replace: !push, ...options });
  }
  return [value, update];
}

export function useNavigationScroll() {
  useEffect(() => {
    if (!readNavigation().moofieView) {
      writeNavigation({ moofieView: "home" }, { replace: true });
    }
    let frame;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const saveScroll = event => {
      if (event.target === document || event.target === window) {
        window.history.replaceState({ ...readNavigation(), moofieScrollY: window.scrollY }, "");
      } else if (event.target?.classList?.contains("course-content-route")) {
        window.history.replaceState({ ...readNavigation(), moofieContentScrollY: event.target.scrollTop }, "");
      }
    };
    const restore = () => {
      const top = readNavigation().moofieScrollY || 0;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
      });
    };
    window.addEventListener("popstate", restore);
    document.addEventListener("scroll", saveScroll, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("popstate", restore);
      document.removeEventListener("scroll", saveScroll, true);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);
}
