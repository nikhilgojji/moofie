import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { sanitizeCourseHtml } from "./courseHtml.js";
const dom = new JSDOM("", { url: "https://moofie.example" });
const base = "https://catcourses.ucmerced.edu/courses/39041/pages/home";
function render(html) { return new dom.window.DOMParser().parseFromString(sanitizeCourseHtml(html, base, dom.window), "text/html"); }

test("instructor tables and Canvas links survive rendering as Moofie links", () => {
  const page = render('<h2>Course Home</h2><table><tr><td rowspan="2">Class</td><td><a href="/courses/39041/assignments/42">Read this</a></td></tr><tr><td>Thursday</td></tr></table>');
  assert.equal(page.querySelector("h2").textContent, "Course Home");
  assert.equal(page.querySelector("td").rowSpan, 2);
  assert.equal(page.querySelector("a").getAttribute("href"), "#");
  assert.equal(page.querySelector("a").getAttribute("data-moofie-link"), "https://catcourses.ucmerced.edu/courses/39041/assignments/42");
  assert.equal(page.querySelector("a").hasAttribute("target"), false);
});

test("embeds, videos and protected images are preserved without embedding Canvas login pages", () => {
  const page = render('<iframe src="https://www.youtube.com/embed/lesson" title="Lesson"></iframe><iframe src="/courses/39041/files/42/preview" title="Syllabus"></iframe><img src="/courses/39041/files/43/preview" alt="Diagram"><video src="https://media.example.edu/lesson.mp4"></video>');
  assert.equal(page.querySelectorAll("iframe").length, 1);
  assert.match(page.querySelector("iframe").getAttribute("sandbox"), /allow-scripts/);
  assert.equal(page.querySelector("a").textContent, "Syllabus");
  assert.equal(page.querySelector("img").getAttribute("data-moofie-asset"), "https://catcourses.ucmerced.edu/courses/39041/files/43/preview");
  assert.equal(page.querySelector("img").getAttribute("alt"), "Diagram");
  assert.equal(page.querySelector("video").hasAttribute("controls"), true);
});

test("active markup, forged internal destinations and hostile embed URLs are removed", () => {
  const page = render('<script>alert(1)</script><img src="https://example.edu/image.png" onerror="alert(1)" data-moofie-asset="https://evil.example/file"><a href="javascript:alert(1)" data-moofie-link="https://evil.example">Bad</a><iframe src="javascript:alert(1)" srcdoc="<script>alert(1)</script>"></iframe><p style="color:red;position:fixed;width:90%;text-align:center">Course text</p>');
  assert.equal(page.querySelector("script, iframe, [onerror], [srcdoc]"), null);
  assert.equal(page.querySelector("[data-moofie-asset], [data-moofie-link]"), null);
  assert.equal(page.querySelector("a").hasAttribute("href"), false);
  assert.equal(page.querySelector("p").style.width, "90%");
  assert.equal(page.querySelector("p").style.color, "");
  assert.equal(page.querySelector("p").style.position, "");
});
