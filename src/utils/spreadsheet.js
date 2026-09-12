import { read, utils } from "xlsx";

export function readWorkbook(bytes) {
  const signature = new Uint8Array(bytes, 0, Math.min(4, bytes.byteLength));
  if (!((signature[0] === 0x50 && signature[1] === 0x4b) || (signature[0] === 0xd0 && signature[1] === 0xcf))) {
    throw new Error("The downloaded file is not a readable Excel or OpenDocument workbook.");
  }
  const workbook = read(bytes, { type: "array", cellStyles: true, cellDates: false });
  if (!workbook.SheetNames.length) throw new Error("This workbook contains no worksheets.");
  return workbook;
}

export function sheetPage(workbook, sheetIndex = 0, rowStart = 0, colStart = 0) {
  const sheet = workbook.Sheets[workbook.SheetNames[sheetIndex]];
  if (!sheet) throw new Error("This worksheet is unavailable.");
  const range = utils.decode_range(sheet["!ref"] || "A1");
  const rowEnd = Math.min(range.e.r + 1, rowStart + 100);
  const colEnd = Math.min(range.e.c + 1, colStart + 30);
  const merges = sheet["!merges"] || [];
  const rows = [];
  for (let r = rowStart; r < rowEnd; r++) {
    const cells = [];
    for (let c = colStart; c < colEnd; c++) {
      const merge = merges.find(m => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);
      if (merge && (r !== Math.max(rowStart, merge.s.r) || c !== Math.max(colStart, merge.s.c))) continue;
      const address = utils.encode_cell(merge ? merge.s : { r, c });
      const cell = sheet[address];
      const fill = cell?.s?.fgColor?.rgb;
      cells.push({ address, text: cell ? String(cell.w ?? utils.format_cell(cell)) : "",
        rowSpan: merge ? Math.min(rowEnd - 1, merge.e.r) - r + 1 : 1,
        colSpan: merge ? Math.min(colEnd - 1, merge.e.c) - c + 1 : 1,
        fill: typeof fill === "string" && /^[\da-f]{6}$/i.test(fill) ? `#${fill}` : undefined,
      });
    }
    rows.push({ number: r + 1, cells });
  }
  return { rows, columns: Array.from({ length: colEnd - colStart }, (_, i) => utils.encode_col(colStart + i)),
    rowCount: range.e.r + 1, colCount: range.e.c + 1, rowStart, colStart };
}
