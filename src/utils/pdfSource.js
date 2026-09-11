// PDF.js transfers its input buffer to its worker. Read a fresh buffer for
// every attempt so retries and React effect cleanup never reuse detached data.
export async function readPdfBytes(file) {
  if (!(file instanceof Blob)) throw new Error("The PDF has not finished downloading.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error("Canvas returned an empty file.");
  const header = new TextDecoder("ascii").decode(bytes.subarray(0, 1024));
  if (!header.includes("%PDF-")) {
    throw new Error("Canvas returned a file that is not a PDF. Try downloading it to check the file.");
  }
  return bytes;
}

export function pdfErrorMessage(error) {
  if (error?.name === "PasswordException") return "This PDF is password-protected. Download it to open it with your password.";
  if (error?.name === "InvalidPDFException") return "This PDF appears to be damaged or incomplete. Try downloading it to check the file.";
  if (/Canvas returned|not finished downloading/.test(error?.message || "")) return error.message;
  return "The PDF preview could not start. Retry the preview or download the file.";
}
