import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCourseNavigation } from "./courseNavigation.js";

// Exercise the backend's actual mapping, including its URL filter, rather
// than starting with already-normalized frontend fixtures.
for (const path of [
  "../../supabase/functions/canvas/index.ts",
]) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const helper = source.slice(source.indexOf("function safeLink("), source.indexOf("async function courseFile("))
    .replace("value: unknown, baseUrl?: string", "value, baseUrl");
  const mapping = source.slice(source.indexOf("    tabs: tabs") + "    tabs: ".length, source.indexOf("    discussions: discussions"))
    .trim().replace(/,$/, "").replace(/: any/g, "");
  const mapTabs = new Function("tabs", "canvasUrl", `${helper}\nreturn ${mapping};`);

  test(`relative Canvas navigation survives backend filtering: ${path}`, () => {
    const names = ["Macmillan Learning", "Mid/Final Grades", "Resources & Policy"];
    const tabs = names.map((label, index) => ({
      id: `context_external_tool_${index}`, label, type: "external", position: index + 1,
      html_url: `/courses/9/external_tools/${index}`,
    }));
    tabs.push({ id: "chat", label: "Chat", html_url: "/courses/9/chat", position: 6 });
    const result = buildCourseNavigation(mapTabs(tabs, "https://canvas.example.edu"));
    assert.deepEqual(result.map(tab => tab.label), names);
    result.forEach((tab, index) => {
      assert.equal(tab.htmlUrl, `https://canvas.example.edu/courses/9/external_tools/${index}`);
      assert.equal(tab.section, null);
    });
  });

  test(`retains HTTPS destinations and excludes hidden or unsafe links: ${path}`, () => {
    const result = mapTabs([
      { id: "site", html_url: "https://example.edu/tools" },
      { id: "hidden", hidden: true, html_url: "/courses/9/settings" },
      { id: "unsafe", html_url: "javascript:alert(1)" },
      { id: "empty", html_url: "" },
    ], "https://canvas.example.edu");
    assert.equal(result.length, 1);
    assert.equal(result[0].htmlUrl, "https://example.edu/tools");
  });
}
