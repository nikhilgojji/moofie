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
      const fields: Record<string, any> = name === "files" ? {
        contentType: raw["content-type"] || null, size: Number(raw.size || 0),
        folderId: raw.folder_id ?? null, locked: Boolean(raw.locked_for_user || raw.hidden_for_user),
      } : name === "quizzes" ? {
        dueAt: raw.due_at || null, unlockAt: raw.unlock_at || null, lockAt: raw.lock_at || null,
        points: Number(raw.points_possible || 0), questionCount: raw.question_count ?? null,
        locked: Boolean(raw.locked_for_user), quizType: raw.quiz_type || null,
      } : name === "pages" ? { pageUrl: raw.url } : name === "items" ? {
        type: raw.type || "Item", contentId: raw.content_id || null, pageUrl: raw.page_url || null,
        indent: Number(raw.indent || 0), dueAt: raw.content_details?.due_at || null,
        locked: Boolean(raw.content_details?.locked_for_user),
      } : name === "tabs" ? { label: raw.label || raw.id || "Course tool", type: raw.type || null } : {};
      for (const [field, value] of Object.entries(fields)) if (output[field] !== value) return false;
      return true;
    });
    checks[name] = { source: expected.length, returned: actual.length, matched };
    if (!matched) throw new Error(`Canvas comparison failed for ${name}. Refreshing this course is required.`);
  }
  return checks;
}

export function compareCanvasCourse(course: any, frontPage: any, mapped: any) {
  const expected = { defaultView: course.default_view || null, syllabusBody: course.syllabus_body || "",
    homeBody: frontPage?.body || "", homeTitle: frontPage?.title || null, hasFrontPage: Boolean(frontPage) };
  if (Object.entries(expected).some(([field, value]) => mapped[field] !== value)) throw new Error("Canvas comparison failed for course home or syllabus.");
  return { source: 1, returned: 1, matched: true };
}

export function resourceSection(path: string) {
  if (path.includes("front_page")) return "home";
  if (path.includes("announcements?")) return "announcements";
  if (path.includes("calendar_events?")) return "syllabusEvents";
  if (path.includes("discussion_topics")) return "discussions";
  if (path.includes("/users")) return "people";
  return path.match(/\/(modules|files|pages|tabs|quizzes|folders|settings|sections)(?:\?|$)/)?.[1] || "course";
}
