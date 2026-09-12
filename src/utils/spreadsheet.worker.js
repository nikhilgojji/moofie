import { readWorkbook, sheetPage } from "./spreadsheet";
let workbook;
self.onmessage = ({ data }) => {
  try {
    if (data.bytes) workbook = readWorkbook(data.bytes);
    self.postMessage({ requestId: data.requestId, names: workbook.SheetNames,
      page: sheetPage(workbook, data.sheetIndex, data.rowStart, data.colStart) });
  } catch (error) { self.postMessage({ requestId: data.requestId, error: error.message }); }
};
