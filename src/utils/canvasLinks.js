export function canvasLink(url, device = globalThis.navigator) {
  let web;
  try {
    web = new URL(url);
    if (web.protocol !== 'https:' || web.username || web.password) return null;
  } catch { return null; }
  const ua = device?.userAgent || '';
  const ios = /iPhone|iPad|iPod/i.test(ua) || (device?.platform === 'MacIntel' && device?.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  // Only actual Canvas course destinations are handed to the native app.
  if (!/^\/courses\/\d+(?:\/|$)/.test(web.pathname)) return { web: web.href, href: web.href, mobile: false };
  const destination = `${web.host}${web.pathname}${web.search}`;
  if (android) return {
    web: web.href, mobile: true,
    href: `intent://${destination}#Intent;scheme=canvas-courses;package=com.instructure.candroid;S.browser_fallback_url=${encodeURIComponent(web.href)};end`,
  };
  if (ios) return { web: web.href, href: `canvas-courses://${destination}${web.hash}`, mobile: true, ios: true };
  return { web: web.href, href: web.href, mobile: false };
}

// iOS does not expose whether Canvas is installed. Cancel the web fallback as
// soon as the browser hands off to the app, including when the user returns.
export function scheduleCanvasFallback(web, browser = window, page = document) {
  let timer;
  const cancel = () => {
    browser.clearTimeout(timer);
    page.removeEventListener('visibilitychange', onVisibility);
    browser.removeEventListener('pagehide', cancel);
    browser.removeEventListener('blur', cancel);
  };
  const onVisibility = () => { if (page.hidden) cancel(); };
  page.addEventListener('visibilitychange', onVisibility);
  browser.addEventListener('pagehide', cancel, { once: true });
  browser.addEventListener('blur', cancel, { once: true });
  timer = browser.setTimeout(() => {
    cancel();
    if (!page.hidden) browser.location.assign(web);
  }, 2500);
  return cancel;
}
