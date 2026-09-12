async function defaultFallback() {
  const [styles, pages] = await Promise.all([import("./spreadsheetStyles.js"), import("./spreadsheet.js")]);
  return { ...styles, ...pages };
}

// Keep the original Blob: transferring bytes to a worker detaches its buffer.
// If startup or parsing fails, the same file can still be read locally.
export function createSpreadsheetReader({ workerFactory, onResult, onError, loadFallback = defaultFallback, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let active = true, worker, timer, blob, fileName, workbook, parser, fallback, latest = { requestId: 0 }, failed = false;
  const stopWorker = () => { clearTimer(timer); if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); worker = null; } };
  const fail = error => { if (active && !failed) { failed = true; stopWorker(); onError(error?.message || "This workbook could not be opened. Please retry."); } };
  const render = () => {
    if (!active || failed || !workbook) return;
    try { onResult({ requestId: latest.requestId, names: workbook.SheetNames, sheets: parser.workbookSheets(workbook), page: parser.sheetPage(workbook, latest.sheetIndex, latest.rowStart, latest.colStart) }); }
    catch (error) { fail(error); }
  };
  function recover() {
    if (!active || failed || fallback) return;
    stopWorker();
    fallback = (async () => {
      parser = await loadFallback();
      if (!active) return;
      const bytes = await blob.arrayBuffer();
      if (!active) return;
      const decoded = await parser.readStyledWorkbook(bytes, fileName);
      if (!active) return;
      workbook = decoded;
      render();
    })().catch(fail);
  }
  const arm = duration => { clearTimer(timer); timer = setTimer(recover, duration); };
  return {
    async open(loadBlob, name) {
      fileName = name;
      try {
        blob = await loadBlob;
        if (!active) return;
        if (blob.size > 25 * 1024 * 1024) throw new Error("This workbook exceeds the 25 MB preview limit. Download the original file to view it.");
        latest = { requestId: 1 };
        try { worker = workerFactory(); } catch { recover(); return; }
        worker.onmessage = ({ data }) => {
          if (!active || failed) return;
          if (data.ready) { arm(60_000); return; }
          if (data.requestId !== latest.requestId) return;
          clearTimer(timer);
          if (data.error) { recover(); return; }
          onResult(data);
        };
        worker.onerror = event => { event?.preventDefault?.(); recover(); };
        arm(10_000);
        const bytes = await blob.arrayBuffer();
        if (active && worker) {
          try { worker.postMessage({ ...latest, bytes, fileName }, [bytes]); }
          catch { recover(); }
        }
      } catch (error) { fail(error); }
    },
    navigate(location) {
      if (!active || failed) return;
      latest = { ...location, requestId: latest.requestId + 1 };
      if (workbook) render();
      else if (worker) {
        arm(60_000);
        try { worker.postMessage(latest); } catch { recover(); }
      }
    },
    dispose() { active = false; stopWorker(); blob = null; workbook = null; },
  };
}
