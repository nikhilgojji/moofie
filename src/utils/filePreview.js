const extensions = {
  pdf: ["pdf"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"],
  video: ["mp4", "webm", "ogv", "mov", "m4v"],
  audio: ["mp3", "m4a", "wav", "ogg", "oga", "aac", "flac"],
  document: ["xls", "xlsx", "xlsm", "ods", "doc", "docx", "odt", "ppt", "pptx", "odp", "rtf"],
  html: ["html", "htm"],
  text: ["txt", "csv", "tsv", "md", "json", "xml", "html", "htm", "css", "js", "ts", "py", "c", "cpp", "h", "java", "r", "sql", "log"],
};

export function filePreviewKind(file = {}) {
  const mime = String(file.contentType || "").toLowerCase();
  if (mime.startsWith("text/html")) return "html";
  if (mime.includes("pdf")) return "pdf";
  if (/officedocument|msword|ms-excel|ms-powerpoint|opendocument|rtf/.test(mime)) return "document";
  for (const kind of ["image", "video", "audio", "text"]) {
    if (mime.startsWith(`${kind}/`)) return kind;
  }
  const extension = String(file.name || "").trim().split(".").pop().toLowerCase();
  for (const [kind, names] of Object.entries(extensions)) {
    if (names.includes(extension)) return kind;
  }
  // Ask Canvas before deciding a less common format cannot be previewed.
  return "document";
}

// Some Canvas attachments keep an Office filename after conversion to an image.
// Only recognize explicit binary signatures; never promote unknown HTML to active content.
export async function detectBinaryPreview(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const starts = (...signature) => signature.every((value, i) => bytes[i] === value);
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { kind: "image", mime: "image/png" };
  if (starts(0xff, 0xd8, 0xff)) return { kind: "image", mime: "image/jpeg" };
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return { kind: "image", mime: "image/gif" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { kind: "image", mime: "image/webp" };
  if (ascii(0, 5) === "%PDF-") return { kind: "pdf", mime: "application/pdf" };
  return null;
}
