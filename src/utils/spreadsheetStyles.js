import ExcelJS from "exceljs";
import { readWorkbook } from "./spreadsheet.js";

const themeColors = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47", "0563C1", "954F72"];
function color(value, palette = themeColors) {
  let rgb = value?.argb?.slice(-6) || palette[value?.theme];
  if (!rgb || !/^[\da-f]{6}$/i.test(rgb)) return undefined;
  if (value.tint) rgb = rgb.match(/../g).map(part => {
    const channel = parseInt(part, 16), tint = Math.max(-1, Math.min(1, value.tint));
    return Math.round(tint < 0 ? channel * (1 + tint) : channel + (255 - channel) * tint).toString(16).padStart(2, "0");
  }).join("");
  return `#${rgb}`;
}
function fontStyle(font = {}, palette) {
  return { fontFamily: font.name ? `${JSON.stringify(font.name)}, sans-serif` : undefined,
    fontSize: font.size ? `${Math.max(1, Math.min(409, font.size))}pt` : undefined,
    fontWeight: font.bold ? "700" : "400", fontStyle: font.italic ? "italic" : "normal",
    textDecoration: [font.underline && "underline", font.strike && "line-through"].filter(Boolean).join(" ") || "none",
    color: color(font.color, palette) };
}
function borderStyle(border, palette) {
  if (!border?.style) return undefined;
  const weight = /thick|double/i.test(border.style) ? 3 : /medium/i.test(border.style) ? 2 : 1;
  const line = border.style === "double" ? "double" : /dash/i.test(border.style) ? "dashed" : /dot|hair/i.test(border.style) ? "dotted" : "solid";
  return `${weight}px ${line} ${color(border.color, palette) || "#000000"}`;
}
function cellStyle(cell, palette) {
  const { font, alignment = {}, border = {}, fill } = cell;
  return { ...fontStyle(font, palette),
    textAlign: ({ centerContinuous: "center", distributed: "justify", fill: "left" })[alignment.horizontal] || alignment.horizontal || (cell.type === ExcelJS.ValueType.Number ? "right" : "left"),
    verticalAlign: ({ middle: "middle", distributed: "middle", justify: "middle" })[alignment.vertical] || alignment.vertical || "bottom",
    whiteSpace: alignment.wrapText ? "pre-wrap" : "pre",
    backgroundColor: fill?.type === "pattern" && fill.pattern === "solid" ? color(fill.fgColor, palette) : undefined,
    ...Object.fromEntries(["top", "right", "bottom", "left"].map(side => [`border${side[0].toUpperCase()}${side.slice(1)}`, borderStyle(border[side], palette)])) };
}

// Header/footer strings are Excel formatting instructions, not HTML. Render
// their text as React children; never inject worksheet-provided markup or CSS.
export function printText(value = "", { sheetName = "", fileName = "", pageNumber = 1, pageCount = 1 } = {}) {
  const sections = { left: [], center: [], right: [] };
  let section = "center", style = {}, buffer = "";
  const flush = () => { if (buffer) sections[section].push({ text: buffer, style: { ...style } }); buffer = ""; };
  const tokens = String(value || "").match(/&&|&"[^"]*"|&K[\da-f]{6}|&\d+|&[A-Za-z]|[^&]+|&/gi) || [];
  for (const token of tokens) {
    if (token === "&&") { buffer += "&"; continue; }
    if (!token.startsWith("&")) { buffer += token; continue; }
    flush();
    if (["&L", "&C", "&R"].includes(token)) section = { "&L": "left", "&C": "center", "&R": "right" }[token];
    else if (token === "&B") style.fontWeight = style.fontWeight === "700" ? "400" : "700";
    else if (token === "&I") style.fontStyle = style.fontStyle === "italic" ? "normal" : "italic";
    else if (token === "&U") style.textDecoration = style.textDecoration ? undefined : "underline";
    else if (/^&\d+$/.test(token)) style.fontSize = `${Math.min(409, Number(token.slice(1)))}pt`;
    else if (token.startsWith('&"')) {
      const [name, face = ""] = token.slice(2, -1).split(",");
      style = { ...style, fontFamily: `${JSON.stringify(name)}, sans-serif`, fontWeight: /bold/i.test(face) ? "700" : "400", fontStyle: /italic/i.test(face) ? "italic" : "normal" };
    } else if (token.startsWith("&K")) style.color = `#${token.slice(2)}`;
    else if (token === "&A") buffer += sheetName;
    else if (token === "&F") buffer += fileName;
    else if (token === "&P") buffer += pageNumber;
    else if (token === "&N") buffer += pageCount;
  }
  flush(); return sections;
}

export async function readStyledWorkbook(bytes, fileName = "") {
  const result = readWorkbook(bytes);
  // ExcelJS reads OOXML styles. Retain the existing reader for legacy XLS/ODS.
  if (new Uint8Array(bytes)[0] !== 0x50 || /\.(xls|ods)$/i.test(fileName)) return result;
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(bytes); }
  catch { result.styleWarning = "Workbook formatting could not be read. Showing cell contents."; return result; }
  const theme = book.model.themes?.theme1 || "";
  const palette = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"].map((name, i) => {
    const node = theme.match(new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`))?.[1];
    return node?.match(/(?:lastClr|val)="([\da-f]{6})"/i)?.[1] || themeColors[i];
  });
  for (const worksheet of book.worksheets) {
    const sheet = result.Sheets[worksheet.name];
    if (!sheet) continue;
    const headerFooter = worksheet.headerFooter || {};
    sheet["!layout"] = { header: printText(headerFooter.differentFirst ? headerFooter.firstHeader : headerFooter.oddHeader, { sheetName: worksheet.name, fileName }),
      footer: printText(headerFooter.differentFirst ? headerFooter.firstFooter : headerFooter.oddFooter, { sheetName: worksheet.name, fileName }),
      defaultRowHeight: (worksheet.properties.defaultRowHeight || 15) * 4 / 3,
      defaultColWidth: (worksheet.properties.defaultColWidth || 8.43) * 7 + 5 };
    sheet["!cols"] = (worksheet.columns || []).map(column => ({ wpx: (column.width || worksheet.properties.defaultColWidth || 8.43) * 7 + 5, hidden: column.hidden }));
    sheet["!rows"] = [];
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      sheet["!rows"][rowNumber - 1] = { hpx: (row.height || worksheet.properties.defaultRowHeight || 15) * 4 / 3, hidden: row.hidden };
      row.eachCell({ includeEmpty: true }, cell => {
        const address = cell.address;
        if (!sheet[address]) sheet[address] = { t: "s", v: "" };
        sheet[address].previewStyle = cellStyle(cell, palette);
        if (cell.value?.richText) sheet[address].previewRuns = cell.value.richText.map(run => ({ text: run.text, style: fontStyle(run.font, palette) }));
      });
    });
  }
  return result;
}
