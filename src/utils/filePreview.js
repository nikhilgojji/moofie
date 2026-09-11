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
  const extension = String(file.name || "").trim().split(".").pop().toLowerCase();
  for (const [kind, names] of Object.entries(extensions)) {
    if (names.includes(extension)) return kind;
  }
  const mime = String(file.contentType || "").toLowerCase();
  if (mime.startsWith("text/html")) return "html";
  if (mime.includes("pdf")) return "pdf";
  for (const kind of ["image", "video", "audio", "text"]) {
    if (mime.startsWith(`${kind}/`)) return kind;
  }
  if (/officedocument|msword|ms-excel|ms-powerpoint|opendocument|rtf/.test(mime)) return "document";
  // Ask Canvas before deciding a less common format cannot be previewed.
  return "document";
}
