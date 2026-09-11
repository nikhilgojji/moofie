const nativeSections = {
  home: "course-overview",
  syllabus: "course-syllabus",
  announcements: "course-announcements",
  modules: "course-modules",
  assignments: "course-assignments",
  files: "course-files",
  pages: "course-pages",
  discussions: "course-discussions",
  quizzes: "course-quizzes",
  people: "course-people",
  grades: "course-grades",
};

const fallbackTabs = [
  ["home", "Home"], ["modules", "Modules"],
  ["announcements", "Announcements"], ["assignments", "Assignments"],
  ["files", "Files"], ["grades", "Grades"], ["pages", "Pages"],
  ["people", "People"], ["quizzes", "Quizzes"], ["discussions", "Discussions"],
].map(([id, label]) => ({ id, label }));

export function buildCourseNavigation(tabs, courseUrl, courseName = "") {
  const seen = new Set();
  const source = [...(tabs?.length ? tabs : fallbackTabs)];
  const isCres = /\bCRES\b/i.test(courseName);
  // UC Merced's institution-wide policy tool uses the same ID in every course.
  try {
    const course = new URL(courseUrl);
    if (course.hostname === "catcourses.ucmerced.edu" && /^\/courses\/\d+\/?$/.test(course.pathname)) {
      const policy = { id: "context_external_tool_1282", label: "Resources & Policy", type: "external", htmlUrl: `${course.origin}${course.pathname.replace(/\/$/, "")}/external_tools/1282` };
      const index = source.findIndex(tab => String(tab.id) === policy.id || /^resources\s*&\s*policy$/i.test(tab.label));
      if (index < 0) source.push(policy);
      else source[index] = policy;
    }
  } catch { /* Only install this institution's tool on its own Canvas instance. */ }
  return source.filter((tab) => {
    const id = String(tab.id).toLowerCase();
    const label = String(tab.label).trim().toLowerCase();
    if (["chat", "conferences", "collaborations"].includes(id) || ["chat", "course evaluations", "yuja panorama", "bigbluebutton", "big blue button", "collaborations"].includes(label) || isCres && ["course resources", "zoom"].includes(label) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).map((tab) => {
    let destination = null;
    try {
      const url = new URL(tab.htmlUrl, courseUrl);
      const course = new URL(courseUrl);
      if (url.protocol === "https:" && url.origin !== course.origin) destination = { kind: "external", url: url.href };
      else if (url.origin === course.origin) {
        const syllabus = url.pathname.match(/^\/courses\/(\d+)\/assignments\/syllabus\/?$/);
        const page = url.pathname.match(/^\/courses\/(\d+)\/pages\/([^/]+)\/?$/);
        const match = url.pathname.match(/^\/courses\/(\d+)\/(files|assignments|quizzes|discussion_topics)\/([1-9]\d*)(?:\/(?:download|preview))?\/?$/);
        const tool = url.pathname.match(/^\/courses\/\d+\/external_tools\/(\d+)\/?$/);
        if (syllabus) destination = { kind: "syllabus", courseId: Number(syllabus[1]) };
        else if (tool) destination = { kind: "tool", toolId: tool[1] };
        else if (page) destination = { kind: "pages", courseId: Number(page[1]), id: decodeURIComponent(page[2]) };
        else if (match) destination = { kind: match[2], courseId: Number(match[1]), id: match[3] };
      }
    } catch { /* Missing URLs never become outgoing links. */ }
    return {
      ...tab,
      destination,
      navigationKey: destination?.kind === "syllabus" ? "course-syllabus" : nativeSections[String(tab.id).toLowerCase()] && tab.type !== "external" ? nativeSections[String(tab.id).toLowerCase()] : `course-tab-${tab.id}`,
      section: destination?.kind === "syllabus" ? "course-syllabus" : tab.type === "external" ? null : nativeSections[String(tab.id).toLowerCase()] || null,
    };
  });
}
