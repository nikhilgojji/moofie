import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasLink, scheduleCanvasFallback } from './canvasLinks.js';
const url = 'https://catcourses.ucmerced.edu/courses/39/assignments/7?x=1#submission';
test('Canvas links preserve the exact assignment on iPhone, iPad, Android and desktop', () => {
  const iphone = canvasLink(url, { userAgent: 'iPhone' });
  assert.equal(iphone.href, 'canvas-courses://catcourses.ucmerced.edu/courses/39/assignments/7?x=1#submission');
  assert.equal(canvasLink(url, { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }).ios, true);
  const android = canvasLink(url, { userAgent: 'Android' });
  assert.match(android.href, /^intent:\/\/catcourses.ucmerced.edu\/courses\/39\/assignments\/7\?x=1#Intent;/);
  assert.ok(android.href.includes(`S.browser_fallback_url=${encodeURIComponent(url)}`));
  assert.equal(canvasLink(url, { userAgent: 'Windows' }).href, url);
  for (const bad of ['javascript:alert(1)', 'http://canvas.example/courses/1', 'https://token@canvas.example/courses/1']) assert.equal(canvasLink(bad), null);
  assert.equal(canvasLink('https://example.com/help', { userAgent: 'iPhone' }).mobile, false);
});
test('iOS fallback opens web only if Canvas did not take over, never on return from the app', () => {
  for (const handoff of [false, true]) {
    const page = new EventTarget(); page.hidden = false;
    const browser = new EventTarget();
    let timer, destination;
    browser.setTimeout = callback => { timer = callback; return 1; };
    browser.clearTimeout = () => { timer = null; };
    browser.location = { assign: value => { destination = value; } };
    scheduleCanvasFallback(url, browser, page);
    if (handoff) {
      page.hidden = true; page.dispatchEvent(new Event('visibilitychange'));
      page.hidden = false;
    }
    timer?.();
    assert.equal(destination, handoff ? undefined : url);
  }
});
