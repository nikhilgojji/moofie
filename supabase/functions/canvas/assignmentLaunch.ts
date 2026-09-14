// Read Canvas's launch form without submitting it or forwarding Canvas credentials to a provider.
function decode(value: string) {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => {
    const code = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  }).replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&");
}
function attributes(value: string) {
  return Object.fromEntries([...value.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3] ?? match[4])]));
}
function secureUrl(value: string, base: string) {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid Canvas launch destination.");
  return url;
}
export function extractAssignmentLaunch(html: string, base: string) {
  const source = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  for (const match of source.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const form = attributes(match[1]);
    if (!/^tool_form(?:_|$)/.test(form.id || "") || form.method?.toUpperCase() !== "POST" || !form.action) continue;
    const fields = [...match[2].matchAll(/<input\b[^>]*>/gi)].map(input => attributes(input[0]))
      .filter(input => input.type?.toLowerCase() === "hidden" && input.name)
      .map(input => ({ name: input.name, value: input.value || "" }));
    const names = new Set(fields.map(field => field.name));
    const lti11 = names.has("oauth_signature") && names.has("lti_message_type");
    const lti13 = names.has("iss") && names.has("login_hint") && names.has("lti_message_hint");
    if (!(lti11 || lti13) || fields.length > 300) continue;
    return { kind: "form", action: secureUrl(form.action, base).href, fields };
  }
  throw new Error("Canvas could not prepare this tool launch. Please try again.");
}

export async function resolveAssignmentLaunch(launchUrl: string, canvasUrl: string, request = fetch) {
  const origin = new URL(canvasUrl).origin;
  let current = secureUrl(launchUrl, canvasUrl);
  if (current.origin !== origin) return { kind: "url", url: current.href };
  const cookies = new Map<string, string>();
  const signal = AbortSignal.timeout(15000);
  for (let hop = 0; hop < 6; hop++) {
    const response = await request(current.href, { redirect: "manual", signal, headers: {
      Accept: "text/html", ...(cookies.size ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {}),
    } });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0]; const equal = pair.indexOf("=");
      if (equal > 0) cookies.set(pair.slice(0, equal), pair.slice(equal + 1));
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) break;
      current = secureUrl(location, current.href);
      if (current.origin !== origin) return { kind: "url", url: current.href };
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
      await response.body?.cancel(); break;
    }
    const reader = response.body?.getReader();
    if (!reader) break;
    const decoder = new TextDecoder(); let html = ""; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) throw new Error("Canvas returned an oversized launch page.");
        html += decoder.decode(value, { stream: true });
      }
      return extractAssignmentLaunch(html + decoder.decode(), current.href);
    } finally { await reader.cancel(); }
  }
  throw new Error("Canvas could not prepare this tool launch. Please try again.");
}
