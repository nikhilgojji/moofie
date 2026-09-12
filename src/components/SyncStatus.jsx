import { useEffect, useState, useSyncExternalStore } from "react";
import { getCanvasSync, subscribeCanvasSync } from "../utils/canvasSync";

export function SyncStatus({ checkedAt, courses = [] }) {
  const snapshot = useSyncExternalStore(subscribeCanvasSync, getCanvasSync, getCanvasSync);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const records = Object.values(snapshot.records);
  const coverage = courses.map(course => ({ name: course.name, ...(snapshot.coverage?.[course.id] || { status: "queued", pages: 0, checkedPages: 0, failedPages: 0, restrictedPages: 0 }) }));
  const checkedCourses = coverage.filter(course => course.status === "current").length;
  const pageCount = coverage.reduce((total, course) => total + course.pages, 0);
  const checkedPages = coverage.reduce((total, course) => total + course.checkedPages, 0);
  const busy = records.some(r => r.status === "checking" || r.status === "retrying");
  const errors = records.filter(r => r.status === "error" || r.status === "partial");
  const dashboard = records.find(r => r.action === "dashboard");
  const lastCheck = dashboard?.checkedAt || checkedAt;
  const minutes = lastCheck ? Math.max(0, Math.floor((now - Date.parse(lastCheck)) / 60_000)) : null;
  const label = navigator.onLine === false ? "Offline · showing saved data" : busy ? "Checking Canvas…" : errors.length ? "Some Canvas data needs attention" : minutes == null ? "Canvas not checked yet" : minutes >= 3 ? `Canvas data is ${minutes} min old` : `Canvas checked ${minutes === 0 ? "just now" : `${minutes} min ago`}`;
  return <details className="canvas-sync-status"><summary aria-label={label}>{label}</summary><div className="canvas-sync-panel">
    <strong>Canvas sync</strong><p>{lastCheck ? `Last successful dashboard check: ${new Date(lastCheck).toLocaleString()}` : "Waiting for the first successful Canvas check."}</p>
    <p>All enrolled courses and their pages are checked in the background while Moofie is open. Incomplete loads retry automatically.</p>
    {coverage.length > 0 && <><p>{checkedCourses} of {coverage.length} course lists checked · {checkedPages} of {pageCount} discovered pages loaded successfully.</p>
      <ul className="canvas-coverage-list">{coverage.map((course, index) => <li key={courses[index].id}><strong>{course.name}</strong>: {({ queued: "Waiting to check", checking: "Checking course lists", current: "Course lists checked", partial: "Incomplete — retrying automatically", error: "Could not check — retrying automatically", restricted: "Access unavailable in Canvas" })[course.status]}{course.failedPages > 0 ? ` · ${course.failedPages} page loads retrying` : ""}{course.restrictedPages > 0 ? ` · ${course.restrictedPages} pages unavailable in Canvas` : ""}</li>)}</ul>
    </>}
    <p>These checks verify Canvas data and page loading. File previews and external tools are checked when opened.</p>
    {errors.length > 0 && <p role="status">{errors.length} request{errors.length === 1 ? "" : "s"} could not fully refresh. Restricted content still follows Canvas permissions.</p>}
    <button type="button" disabled={busy || navigator.onLine === false} onClick={() => window.dispatchEvent(new Event("moofie:refresh"))}>Check Canvas now</button>
  </div></details>;
}
