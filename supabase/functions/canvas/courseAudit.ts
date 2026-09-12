// Compare every returned list with its authoritative Canvas response. Do not
// silently publish truncated mappings as complete course content.
export function compareCanvasCollections(sources: Record<string, any[]>, mapped: Record<string, any>) {
  const checks: Record<string, { source: number; returned: number; matched: boolean }> = {};
  for (const [name, source] of Object.entries(sources)) {
    const id = (item: any) => String(name === "pages" ? item.page_id || item.url || item.id : item.id);
    const expected = source.map(id);
    const actual = (mapped[name] || []).map(id);
    const matched = expected.length === actual.length && expected.every((key, i) => {
      if (key !== actual[i]) return false;
      const raw = source[i], output = mapped[name][i];
      const title = raw.title ?? raw.display_name ?? raw.filename ?? raw.name;
      if (title != null && title !== (output.title ?? output.name)) return false;
      for (const field of ["message", "description"]) if (raw[field] != null && output[field] !== raw[field]) return false;
      return true;
    });
    checks[name] = { source: expected.length, returned: actual.length, matched };
    if (!matched) throw new Error(`Canvas comparison failed for ${name}. Refreshing this course is required.`);
  }
  return checks;
}

export function resourceSection(path: string) {
  if (path.includes("front_page")) return "home";
  if (path.includes("announcements?")) return "announcements";
  if (path.includes("calendar_events?")) return "syllabusEvents";
  if (path.includes("discussion_topics")) return "discussions";
  if (path.includes("/users")) return "people";
  return path.match(/\/(modules|files|pages|tabs|quizzes|folders|settings|sections)(?:\?|$)/)?.[1] || "course";
}
