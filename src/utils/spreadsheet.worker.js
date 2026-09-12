import { sheetPage, workbookSheets } from "./spreadsheet";
import { readStyledWorkbook } from "./spreadsheetStyles";
let workbook;
self.postMessage({ ready: true });
self.onmessage = async ({ data }) => {
  try {
    if (data.bytes) workbook = await readStyledWorkbook(data.bytes, data.fileName);
    self.postMessage({ requestId: data.requestId, names: workbook.SheetNames, sheets: workbookSheets(workbook),
      page: sheetPage(workbook, data.sheetIndex, data.rowStart, data.colStart) });
  } catch (error) { self.postMessage({ requestId: data.requestId, error: error.message }); }
};
