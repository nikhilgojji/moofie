// Read-only LTI content retrieval. Canvas credentials never go to a provider.
const decode = (value: string) => value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n))).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (value: string) => decode(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
function attrs(tag: string) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4])]));
}
function https(value: string, base?: string) {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !url.hostname.includes(".") || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(":") || /(?:^|\.)(localhost|local|internal)$/.test(url.hostname)) throw new Error("Unsupported tool destination.");
  return url;
}

export function extractToolContent(html: string, base: string, purpose: string) {
  const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(table =>
    [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => text(cell[1]))).filter(row => row.length));
  const links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap(match => {
    try {
      const label = text(match[2]);
      const href = attrs(match[1]).href;
      if (!label || !href) return [];
      const preceding = html.slice(Math.max(0, (match.index || 0) - 800), match.index);
      const previousLink = preceding.lastIndexOf("</a>");
      const nearby = preceding.slice(previousLink < 0 ? 0 : previousLink + 4) + match[2];
      const image = [...nearby.matchAll(/<img\b[^>]*>/gi)].at(-1);
      let iconUrl = null;
      try { if (image) iconUrl = https(attrs(image[0]).src, base).href; } catch { /* Use the local icon when no public image is supplied. */ }
      return [{ label, url: https(href, base).href, iconUrl }];
    } catch { return []; }
  });
  if (/mid.*final.*grades/i.test(purpose)) {
    const table = tables.find(rows => rows.some(row => row.some(cell => /^period$/i.test(cell))) && rows.some(row => row.some(cell => /^grade$/i.test(cell))));
    if (!table) throw new Error("The grade service did not return its course-grade table. No calculated grades have been substituted.");
    return { kind: "grades", rows: table };
  }
  if (/macmillan/i.test(purpose)) {
    const names = ["Achieve", "Macmillan Learning Diagnostics", "Macmillan Technical Support", "Macmillan User Profile"];
    const menu = names.map(label => {
      const link = links.find(link => link.label.toLowerCase() === label.toLowerCase());
      return { label, url: link?.url || null, iconUrl: link?.iconUrl || null };
    });
    if (!menu.some(item => item.url)) throw new Error("Macmillan did not return its learning-tools menu in the authenticated response.");
    return { kind: "macmillan", links: menu };
  }
  const body = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const paragraphs = [...body.matchAll(/<(?:p|h[1-6]|li)\b[^>]*>([\s\S]*?)<\/(?:p|h[1-6]|li)>/gi)].map(match => text(match[1])).filter(Boolean);
  if (!paragraphs.length) throw new Error("The policy service did not return readable content.");
  if (/sign in|log in|login/i.test(text(body)) && /type\s*=\s*["']password/i.test(body)) throw new Error("The service requires a separate sign-in before its content is available.");
  return { kind: "policy", paragraphs, links };
}

async function publicAddresses(hostname: string): Promise<string[]> {
  const results = await Promise.allSettled([Deno.resolveDns(hostname, "A"), Deno.resolveDns(hostname, "AAAA")]);
  return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
}

// Box's shared document page is a JavaScript viewer, not policy HTML.
// Use its documented embed URL, preserving the exact share selected by Canvas.
export function boxPolicyEmbed(value: string, base?: string) {
  try {
    const url = https(value, base);
    if (!/(^|\.)box\.com$/i.test(url.hostname)) return null;
    const share = url.pathname.match(/^\/(?:embed\/)?s\/([a-zA-Z0-9_-]+)(?:\/file\/(\d+))?\/?$/);
    if (!share) return null;
    url.pathname = `/embed/s/${share[1]}${share[2] ? `/file/${share[2]}` : ""}`;
    url.search = "";
    url.hash = "";
    url.searchParams.set("uxLite", "true");
    return url.href;
  } catch { return null; }
}

export function policyDocumentTarget(html: string, base: string) {
  const candidates = [...html.matchAll(/<(?:iframe|embed|object)\b[^>]*>/gi)].flatMap(match => {
    const tag = attrs(match[0]);
    const value = tag.src || tag.data;
    if (!value) return [];
    try {
      const url = https(value, base);
      return boxPolicyEmbed(url.href) || /\.pdf$/i.test(url.pathname) ? [url.href] : [];
    } catch { return []; }
  });
  // A wrapper must identify one document; never pick an unrelated PDF from a list.
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

export function isPublicAddress(address: string) {
  if (address.includes(":")) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:0:|db8:|10:|20:)/i.test(address) && !/^2002:/i.test(address);
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19) || a === 192 && b === 0 || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113);
}

export async function readToolContent(launchUrl: string, canvasUrl: string, purpose: string, resolveAddresses = publicAddresses) {
  const canvasOrigin = https(canvasUrl).origin;
  const allowed = new Set([canvasOrigin]);
  let current = https(launchUrl);
  // A Canvas-issued sessionless URL may point directly to its provider.
  allowed.add(current.origin);
  const cookies = new Map<string, Map<string, string>>();
  let method = "GET";
  let body: URLSearchParams | undefined;
  const signal = AbortSignal.timeout(25000);
  for (let step = 0; step < 8; step++) {
    if (!allowed.has(current.origin)) throw new Error("The tool redirected to an unrecognized service.");
    const policyDocument = /resources.*policy/i.test(purpose);
    const embed = policyDocument && boxPolicyEmbed(current.href);
    if (embed) return { kind: "policy-embed", url: embed };
    const jar = cookies.get(current.origin) || new Map<string, string>();
    const response = await fetch(current, { method, body, redirect: "manual", signal, headers: {
      ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    } });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const split = pair.indexOf("="); if (split > 0) jar.set(pair.slice(0, split), pair.slice(split + 1)); }
    cookies.set(current.origin, jar);
    if (response.status >= 300 && response.status < 400) {
      const next = https(response.headers.get("location") || "", current.href);
      // Policy documents can live on public document hosts, not just the university domain.
      // Validate each new destination; never replay signed POST bodies to it.
      const policyDocument = /resources.*policy/i.test(purpose);
      const preservesBody = (response.status === 307 || response.status === 308) && method === "POST";
      if (next.origin !== current.origin && !allowed.has(next.origin)) {
        if (!policyDocument || preservesBody) throw new Error("The tool redirected to a destination Moofie has not verified for this integration.");
        const addresses = await resolveAddresses(next.hostname);
        if (!addresses.length || !addresses.every(isPublicAddress)) throw new Error("The policy document destination could not be verified as a public server.");
        allowed.add(next.origin);
      }
      current = next;
      if (response.status !== 307 && response.status !== 308) { method = "GET"; body = undefined; }
      continue;
    }
    if (!response.ok) throw new Error(`The connected service could not return content (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 12 * 1024 * 1024) throw new Error("This tool document is too large to load here.");
    if (new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") {
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return { kind: "pdf", data: btoa(binary) };
    }
    const html = new TextDecoder().decode(bytes);
    const documentTarget = policyDocument && policyDocumentTarget(html, current.href);
    if (documentTarget) {
      const next = https(documentTarget);
      if (!allowed.has(next.origin)) {
        const addresses = await resolveAddresses(next.hostname);
        if (!addresses.length || !addresses.every(isPublicAddress)) throw new Error("The policy document destination could not be verified as a public server.");
        allowed.add(next.origin);
      }
      current = next;
      method = "GET";
      body = undefined;
      continue;
    }
    // Submit only Canvas's signed LTI launch form, never arbitrary page forms.
    const form = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].find(match => /name\s*=\s*["']oauth_signature["']/i.test(match[2]));
    if (form && current.origin === canvasOrigin) {
      const fields = [...form[2].matchAll(/<input\b[^>]*>/gi)].map(match => attrs(match[0]));
      body = new URLSearchParams(fields.filter(field => field.name && field.type?.toLowerCase() === "hidden").map(field => [field.name, field.value || ""]));
      current = https(attrs(form[1]).action, current.href);
      allowed.add(current.origin);
      method = "POST";
      continue;
    }
    return extractToolContent(html, current.href, purpose);
  }
  throw new Error("The tool did not finish its authentication sequence.");
}
