const homeSections = {
  wiki: "course-overview",
  modules: "course-modules",
  assignments: "course-assignments",
  syllabus: "course-syllabus",
  feed: "course-activity",
};

// Home is a navigation destination, while Canvas chooses the content it shows.
// A saved front page or syllabus must never override an instructor's selection.
export function courseContentSection(activeSection, course) {
  if (activeSection !== "course-overview") return activeSection;
  return homeSections[course?.defaultView] || "course-overview";
}
