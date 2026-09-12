import { useEffect, useState, useSyncExternalStore } from "react";
import { getCanvasSync, subscribeCanvasSync } from "../utils/canvasSync";

export function SyncStatus({ checkedAt }) {
  const snapshot = useSyncExternalStore(subscribeCanvasSync, getCanvasSync, getCanvasSync);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const records = Object.values(snapshot.records);
  const busy = records.some(r => r.status === "checking" || r.status === "retrying");
  const errors = records.filter(r => r.status === "error" || r.status === "partial");
  const dashboard = records.find(r => r.action === "dashboard");
  const lastCheck = dashboard?.checkedAt || checkedAt;
  const minutes = lastCheck ? Math.max(0, Math.floor((now - Date.parse(lastCheck)) / 60_000)) : null;
  const label = navigator.onLine === false ? "Offline · showing saved data" : busy ? "Checking Canvas…" : errors.length ? "Some Canvas data needs attention" : minutes == null ? "Canvas not checked yet" : minutes >= 3 ? `Canvas data is ${minutes} min old` : `Canvas checked ${minutes === 0 ? "just now" : `${minutes} min ago`}`;
  return <details className="canvas-sync-status"><summary aria-label={label}>{label}</summary><div className="canvas-sync-panel">
    <strong>Canvas sync</strong><p>{lastCheck ? `Last successful dashboard check: ${new Date(lastCheck).toLocaleString()}` : "Waiting for the first successful Canvas check."}</p>
    <p>Open courses are checked automatically while Moofie is in use. Saved data stays visible if a connection fails.</p>
    {errors.length > 0 && <p role="status">{errors.length} request{errors.length === 1 ? "" : "s"} could not fully refresh. Restricted content still follows Canvas permissions.</p>}
    <button type="button" disabled={busy || navigator.onLine === false} onClick={() => window.dispatchEvent(new Event("moofie:refresh"))}>Check Canvas now</button>
  </div></details>;
}
