import createDOMPurify from "dompurify";
import { canvasLinkNavigation } from "./canvasLinks.js";

const purifiers = new WeakMap();
const layoutProperties = new Set(["width", "height", "max-width", "max-height", "min-width", "text-align", "vertical-align", "display", "grid-template-columns", "gap", "padding", "padding-left", "padding-right", "margin", "margin-left", "margin-right", "border-collapse"]);

export function sanitizeCourseHtml(value, baseUrl, hostWindow = window) {
  if (!value) return "";
  const document = new hostWindow.DOMParser().parseFromString(value, "text/html");
  let base;
  try { base = new URL(baseUrl); } catch { base = new URL(hostWindow.location.href); }
  document.querySelectorAll("script, style, form, input, button, meta, link, base").forEach(element => element.remove());
  document.body.querySelectorAll("*").forEach(element => {
    [...element.attributes].forEach(attribute => {
      if (/^on|^data-moofie-|^srcdoc$/i.test(attribute.name)) element.removeAttribute(attribute.name);
    });
    if (element.hasAttribute("style")) {
      for (const name of Array.from(element.style)) {
        if (!layoutProperties.has(name) || /url\s*\(|expression\s*\(/i.test(element.style.getPropertyValue(name))) element.style.removeProperty(name);
      }
    }
    for (const name of ["href", "src", "poster", "data"]) {
      if (!element.hasAttribute(name)) continue;
      try {
        const raw = element.getAttribute(name);
        if (name === "href" && raw.startsWith("#")) continue;
        const url = new URL(raw, base);
        const link = element.tagName === "A" && name === "href";
        if (!(url.protocol === "https:" || link && ["http:", "mailto:", "tel:"].includes(url.protocol)) || url.username || url.password) {
          element.removeAttribute(name);
          continue;
        }
        element.setAttribute(name, url.href);
        if (link && url.origin === base.origin && canvasLinkNavigation(url.href, base.href)) {
          element.setAttribute("data-moofie-link", url.href);
        } else if (name === "src" && ["IMG", "VIDEO", "AUDIO", "SOURCE"].includes(element.tagName) && url.origin === base.origin) {
          const destination = canvasLinkNavigation(url.href, base.href);
          if (destination?.moofieViewer?.type === "file") {
            element.setAttribute("data-moofie-asset", url.href);
            element.removeAttribute("src");
          }
        }
      } catch { element.removeAttribute(name); }
    }
    // Resolve src ourselves so responsive image candidates cannot bypass it.
    element.removeAttribute("srcset");
    if (element.tagName === "A") {
      if (element.hasAttribute("data-moofie-link") || element.getAttribute("href")?.startsWith("#")) { element.removeAttribute("target"); element.removeAttribute("rel"); }
      else { element.setAttribute("target", "_blank"); element.setAttribute("rel", "noreferrer noopener"); }
    }
    if (["IFRAME", "OBJECT", "EMBED"].includes(element.tagName)) {
      const source = element.getAttribute("src") || element.getAttribute("data");
      let url;
      try { url = new URL(source); } catch { element.remove(); return; }
      if (url.protocol !== "https:") { element.remove(); return; }
      if (url.origin === base.origin) {
        const link = document.createElement("a");
        link.textContent = element.getAttribute("title") || "Open course document";
        link.href = url.href;
        if (canvasLinkNavigation(url.href, base.href)) link.setAttribute("data-moofie-link", url.href);
        else { link.target = "_blank"; link.rel = "noreferrer noopener"; }
        element.replaceWith(link);
      } else {
        const frame = document.createElement("iframe");
        frame.src = url.href;
        frame.title = element.getAttribute("title") || "Embedded course content";
        frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation allow-popups allow-downloads");
        frame.setAttribute("allowfullscreen", "");
        frame.setAttribute("loading", "lazy");
        frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        element.replaceWith(frame);
      }
    }
    if (element.tagName === "IMG") element.setAttribute("loading", "lazy");
    if (["VIDEO", "AUDIO"].includes(element.tagName)) element.setAttribute("controls", "");
  });
  if (!purifiers.has(hostWindow)) purifiers.set(hostWindow, createDOMPurify(hostWindow));
  return purifiers.get(hostWindow).sanitize(document.body, {
    ADD_TAGS: ["iframe"], ADD_ATTR: ["sandbox", "allowfullscreen", "referrerpolicy", "loading", "target"],
    FORBID_TAGS: ["form", "input", "button", "style", "script", "object", "embed"],
    FORBID_ATTR: ["srcdoc"],
  });
}
