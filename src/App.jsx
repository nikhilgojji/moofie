import { DocumentToolbar, useDocumentFullscreen } from "./components/DocumentToolbar";
import { FilePreview, FileDownload, useFilePreview } from "./components/FilePreview";
import { courseSectionStatus, mergeCourseResources, startCanvasAutoRefresh, updateCanvasCoverage } from "./utils/canvasSync";
import { startCourseCoverage } from "./utils/courseCoverage";
import { CourseAvatar as CourseAuthorAvatar } from "./components/CourseAvatar";
import { CoursePeoplePanel } from "./components/CoursePeoplePanel";
import { clearCanvasReadCache } from "./canvasApi";
import { CoursePerson } from "./components/CoursePerson";
import { canvasLinkNavigation } from "./utils/canvasLinks";
import { SafeCourseHtml } from "./components/SafeCourseHtml";
import { quizMetadata } from "./utils/quizDisplay";
import { courseContentSection } from "./utils/courseHome";
import { CourseModules } from "./components/CourseModules";
import { ContentSkeleton } from "./components/ContentSkeleton";
import { CourseQuizzes } from "./components/CourseQuizzes";
import { sortCourseAssignments } from "./utils/assignmentOrder";
import { CourseSyllabus } from "./components/CourseSyllabus";
import { CourseDiscussions } from "./components/CourseDiscussions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { closedContent, readNavigation, useHistoryState, useNavigationScroll, writeNavigation } from "./utils/navigation";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { pdfErrorMessage, readPdfBytes } from "./utils/pdfSource";
import { buildCourseNavigation } from "./utils/courseNavigation";
import {
  connectCanvasAccount,
  deleteMoofieAccount,
  disconnectCanvasAccount,
  loadAssignmentDetails,
  loadCanvasDashboard,
  loadCoursePage,
  loadCourseContent,
  loadCourseResources,
  submitAssignment as submitCanvasAssignment,
} from "./canvasApi";
import { CourseAssignments, CourseFiles } from "./components/CourseLists";
import { CourseTool } from "./components/CourseTool";
import { PublicNav, SignedInNav, SiteFooter } from "./components/SiteChrome";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  clearDashboardCache,
  readDashboardCache,
  sanitizeDashboard,
  writeDashboardCache,
} from "./utils/dashboardCache";
import {
  calculateCourseGrade,
  calculateGroupGrade,
  courseAssignmentCounts,
  formatCourseUpdatedAt,
  formatDueDate,
  formatPercent,
  formatPoints,
  getAssignmentList,
  gradeLetterForPercent,
  gradeTone,
  groupPointTotals,
} from "./utils/gradebook";

// Canvas wraps the useful course name in term and section metadata, such as
// "F26-CSE 030 01". Keep that metadata out of the visible course label.
function formatCourseDisplayName(name) {
  return String(name ?? "")
    .trim()
    .replace(/^[A-Z]\d{2}-/i, "")
    .replace(/\s+\d{2}$/, "");
}

function getCourseTermLabel(name) {
  const match = String(name ?? "").trim().match(/^([FSUW])(\d{2})-/i);
  if (!match) return null;

  const terms = { F: "Fall", S: "Spring", U: "Summer", W: "Winter" };
  return `${terms[match[1].toUpperCase()]} 20${match[2]}`;
}

function completedAssignmentsStorageKey(userId) {
  return `moofie-completed-assignments:${userId}`;
}

function assignmentKey(courseId, assignmentId) {
  return `${courseId}:${assignmentId}`;
}

function readCompletedAssignments(userId) {
  if (!userId) return new Set();

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(completedAssignmentsStorageKey(userId)) ||
        "[]",
    );
    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeCompletedAssignments(userId, completed) {
  if (!userId) return;
  try {
    window.localStorage.setItem(
      completedAssignmentsStorageKey(userId),
      JSON.stringify([...completed]),
    );
  } catch {
    // The checkbox still works for this session if browser storage is blocked.
  }
}

function RefreshFeedback({ feedback }) {
  if (feedback.phase === "idle") return null;

  const label = {
    pulling: "Pull to refresh",
    ready: "Release to refresh",
    refreshing: "Refreshing grades",
    done: "Grades refreshed",
    error: "Refresh failed",
  }[feedback.phase];

  return (
    <div
      className={`refresh-feedback ${feedback.phase}`}
      role="status"
      aria-label={label}
      style={{ "--pull-progress": Math.min(feedback.distance / 64, 1) }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {feedback.phase === "done" ? (
          <path d="m6.5 12.5 3.5 3.5 7.5-8" />
        ) : feedback.phase === "error" ? (
          <path d="m8 8 8 8m0-8-8 8" />
        ) : (
          <>
            <path d="M19 7v5h-5" />
            <path d="M18.2 12a7 7 0 1 0-1.5 5" />
          </>
        )}
      </svg>
    </div>
  );
}

// Authentication screen: starts Google OAuth and explains required consent.
function AuthScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    if (!isSupabaseConfigured) {
      setError("Add your Supabase URL and publishable key to .env.local first.");
      return;
    }

    setLoading(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  }

  return (
    <main className="access-page landing-page" id="top">
      <PublicNav label="Landing page navigation" />

      <section className="access-layout access-hero">
        <div className="access-copy">
          <h1>
            Connect to <span>CatCourses</span>
          </h1>

          <p>
            Sign in to Moofie, then connect your CatCourses account to access
            your courses on multiple devices.
          </p>
        </div>

        <div className="access-form auth-form">
          <div className="form-heading">
            <span>Moofie account</span>
            <span>Required</span>
          </div>

          {error && <div className="error">{error}</div>}

          <button
            className="submit-button"
            type="button"
            onClick={signIn}
            disabled={loading}
          >
            {loading ? (
              "Opening Google…"
            ) : (
              <span className="google-button-content">
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.613Z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.182l-2.909-2.258c-.806.54-1.835.859-3.047.859-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
                  <path fill="#FBBC05" d="M3.963 10.705A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.705V4.963H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.037l3.007-2.332Z" />
                  <path fill="#EA4335" d="M9 3.58c1.322 0 2.508.455 3.441 1.346l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .956 4.963l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z" />
                </svg>
                <span>Sign in with Google</span>
              </span>
            )}
          </button>

          <div className="auth-form-notes">
            <p className="auth-consent">
              By continuing, you agree to Moofie&apos;s{" "}
              <a href="/terms">Terms of Service</a> and{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </section>

      <section className="about-section" id="about">
        <a className="homepage-learn-more" href="/about">
          Learn more about Moofie →
        </a>
      </section>
    </main>
  );
}

// Connection screen: collects the Canvas instance URL and a temporary token.
function ConnectScreen({ onConnect, onSignOut, onDeleteAccount }) {
  const [canvasUrl, setCanvasUrl] = useState(
    "https://catcourses.ucmerced.edu",
  );
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function connect(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const dashboard = await connectCanvasAccount(canvasUrl, token);
      setToken("");
      onConnect(dashboard);
    } catch (requestError) {
      setError(requestError.message || "Moofie could not connect.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="access-page connect-page">
      <PublicNav label="Connection page navigation" />

      <section className="access-layout">
        <div className="access-copy">
          <h1>
            Connect to <span>CatCourses</span>
          </h1>
          <p>
            Use the same Moofie account to access your connected gradebook
            on multiple devices.
          </p>
        </div>

        <form className="access-form" onSubmit={connect}>
          <label>
            Canvas URL
            <input
              type="url"
              value={canvasUrl}
              onChange={(event) => setCanvasUrl(event.target.value)}
              required
            />
          </label>

          <label>
            Personal access token
            <div className="token-field">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowToken((current) => !current)}
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          {error && <div className="error">{error}</div>}

          <button className="submit-button" disabled={loading}>
            {loading ? "Connecting" : "Open gradebook"}
          </button>

          <details>
            <summary>How do I create a token?</summary>
            <ol>
              <li>Open CatCourses and go to Account → Settings.</li>
              <li>Find Approved Integrations.</li>
              <li>
                Select New Access Token and choose the maximum expiration period
                (90 days).
              </li>
            </ol>
          </details>

          <button className="text-button" type="button" onClick={onSignOut}>
            Sign out of Moofie
          </button>

          <button
            className="text-button danger-action"
            type="button"
            onClick={onDeleteAccount}
          >
            Delete Moofie account
          </button>
        </form>
      </section>
    </main>
  );
}

// Dashboard summary: calculate global upcoming/missing counts and expose filters.
function GradeSummary({ courses, activeFilter, completed, onToggle }) {
  const isCompleted = ({ course, assignment }) =>
    completed.has(assignmentKey(course.id, assignment.id));
  const upcoming = getAssignmentList(courses, "upcoming").filter(
    (item) => !isCompleted(item),
  );
  const missing = getAssignmentList(courses, "missing").filter(
    (item) => !isCompleted(item),
  );
  const past = getAssignmentList(courses, "past");

  return (
    <div className="grade-summary" aria-label="Assignment summary">
      <button
        className={
          activeFilter === "upcoming"
            ? "summary-card is-active"
            : "summary-card"
        }
        type="button"
        onClick={() => onToggle("upcoming")}
        aria-pressed={activeFilter === "upcoming"}
        title="Show upcoming assignments"
      >
        <span className="summary-icon" aria-hidden="true">
          ↗
        </span>

        <span className="summary-copy">
          <span>Upcoming</span>
          <small>assignments</small>
        </span>

        <strong>{upcoming.length}</strong>
      </button>

      <button
        className={
          activeFilter === "missing"
            ? "summary-card missing is-active"
            : "summary-card missing"
        }
        type="button"
        onClick={() => onToggle("missing")}
        aria-pressed={activeFilter === "missing"}
        title="Show missing assignments"
      >
        <span className="summary-icon" aria-hidden="true">
          !
        </span>

        <span className="summary-copy">
          <span>Missing</span>
          <small>assignments</small>
        </span>

        <strong>{missing.length}</strong>
      </button>

      <button
        className={
          activeFilter === "past"
            ? "summary-card past is-active"
            : "summary-card past"
        }
        type="button"
        onClick={() => onToggle("past")}
        aria-pressed={activeFilter === "past"}
        title="Show past assignments"
      >
        <span className="summary-icon" aria-hidden="true">
          ✓
        </span>

        <span className="summary-copy">
          <span>Past</span>
          <small>assignments</small>
        </span>

        <strong>{past.length}</strong>
      </button>
    </div>
  );
}

function AssignmentPreview({
  type,
  items,
  completed,
  onToggleCompleted,
  onOpenAssignment,
}) {
  if (!type) return null;

  const title = {
    upcoming: "Upcoming this week",
    missing: "Missing assignments",
    past: "Past assignments",
  }[type];

  return (
    <section className="assignment-preview" aria-label={title}>
      <div className="assignment-preview-heading">
        <h2>{title}</h2>
      </div>

      {items.length === 0 ? (
        <div className="assignment-preview-empty">
          <div>
            <strong>
              {type === "upcoming"
                ? "Your schedule is clear"
                : type === "past"
                  ? "No past assignments"
                  : "All caught up"}
            </strong>
            <p>
              {type === "upcoming"
                ? "You have no assignments due in the next seven days."
                : type === "past"
                  ? "Past assignments will appear here after their due day."
                  : "You have no missing assignments. Nice work."}
            </p>
          </div>
        </div>
      ) : (
        <div className="assignment-preview-list">
          {items.map(({ course, assignment }) => {
            const key = assignmentKey(course.id, assignment.id);
            const isManuallyDone = completed.has(key);
            const isSubmitted = Boolean(assignment.submitted);
            const isChecked = isManuallyDone || isSubmitted;
            const isCrossed = isManuallyDone || (type === "past" && isSubmitted);
            const status = isSubmitted
              ? "Submitted"
              : assignment.missing
                ? "Missing"
                : isManuallyDone
                  ? "Done"
                  : null;
            const details = (
              <>
                <span>{formatCourseDisplayName(course.name)}</span>
                <strong>{assignment.title}</strong>
                <div className="assignment-preview-meta">
                  <small>Due {formatDueDate(assignment.dueAt)}</small>
                  {status && (
                    <span
                      className={`assignment-status-pill ${status.toLowerCase()}`}
                    >
                      {status}
                    </span>
                  )}
                </div>
              </>
            );

            return (
              <div
                className={
                  isCrossed
                    ? "assignment-preview-item is-completed"
                    : "assignment-preview-item"
                }
                key={key}
              >
                <button
                  className="assignment-complete-toggle"
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={
                    isSubmitted
                      ? `${assignment.title} was submitted`
                      : `Mark ${assignment.title} ${
                          isManuallyDone ? "not finished" : "finished"
                        }`
                  }
                  disabled={isSubmitted}
                  onClick={() => onToggleCompleted(course.id, assignment)}
                >
                  {isChecked && (
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m3.5 8 3 3 6-6" />
                    </svg>
                  )}
                </button>

                <button
                  className="assignment-preview-copy"
                  type="button"
                  onClick={() => onOpenAssignment(course, assignment)}
                >
                  {details}
                </button>

                <b aria-hidden="true">›</b>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatResourceDate(value, includeTime = false) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime
      ? { hour: "numeric", minute: "2-digit" }
      : {}),
  }).format(new Date(value));
}

function formatModuleDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

function announcementText(value) {
  if (!value) return "No announcement details were provided.";
  const document = new DOMParser().parseFromString(value, "text/html");
  return document.body.textContent?.replace(/\s+/g, " ").trim() ||
    "No announcement details were provided.";
}

function CourseRowChevron({ external = false }) {
  return external ? (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M7 5h8v8M15 5 6 14" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="m8 5 5 5-5 5" />
    </svg>
  );
}

function CourseItemIcon({ type }) {
  const normalizedType = String(type || "").toLowerCase();
  if (normalizedType === "file") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m9.5 12.5 5.8-5.8a3 3 0 0 1 4.2 4.2l-7.8 7.8a5 5 0 0 1-7.1-7.1l7.6-7.6" />
      </svg>
    );
  }
  if (normalizedType === "discussion") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 15a4 4 0 0 1-4 4H9l-5 3v-7a4 4 0 0 1-1-2.6V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z" />
      </svg>
    );
  }
  if (normalizedType === "quiz") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2.9-1.2 1.8M12 17h.01" />
      </svg>
    );
  }
  if (normalizedType === "assignment") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M8 4h8M9 3v3h6V3M7 5H5v16h14V5h-2M8 13l2.5 2.5L16 10" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 3h8l4 4v14H6Z" />
      <path d="M14 3v5h4M9 12h6M9 16h6" />
    </svg>
  );
}

function CourseNavigation({ activeSection, items, onSelect }) {
  return (
    <div className="home-course-navigation">
      {items.map((tab) => tab.destination?.kind === "external" ? (
        <a key={tab.id} href={tab.destination.url} target="_blank" rel="noreferrer" title={`${tab.label} (opens in a new tab)`}>
          <span>{tab.label}</span>
          <span aria-hidden="true"><CourseRowChevron external /></span>
        </a>
      ) : (
        <button
          aria-current={activeSection === tab.navigationKey ? "page" : undefined}
          className={activeSection === tab.navigationKey ? "is-active" : ""}
          type="button"
          key={tab.id}
          onClick={() => onSelect(tab)}
        >
          <span>{tab.label}</span>
          <span aria-hidden="true">
            <CourseRowChevron external={!tab.section} />
          </span>
        </button>
      ))}
    </div>
  );
}

function ResourceRow({ href, onClick, children, className = "" }) {
  const classes = `home-resource-row ${className}`.trim();
  if (onClick) {
    return (
      <button className={classes} type="button" onClick={onClick}>
        {children}
        <span className="home-resource-arrow"><CourseRowChevron /></span>
      </button>
    );
  }
  return href ? (
    <a className={classes} href={href} rel="noreferrer" target="_blank">
      {children}
      <span className="home-resource-arrow"><CourseRowChevron external /></span>
    </a>
  ) : (
    <div className={classes}>{children}</div>
  );
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Moofie could not read that file."));
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

function PdfPageCanvas({ pdfDocument, pageNumber, rotation, scale, setPageElement }) {
  const canvasRef = useRef(null);
  const [rendering, setRendering] = useState(true);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return undefined;
    let active = true;
    let renderTask = null;
    setRendering(true);
    setPageError("");

    pdfDocument.getPage(pageNumber)
      .then((page) => {
        if (!active || !canvasRef.current) return null;
        const viewport = page.getViewport({
          scale,
          rotation: (page.rotate + rotation) % 360,
        });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? null : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        return renderTask.promise;
      })
      .then(() => {
        if (active) setRendering(false);
      })
      .catch((error) => {
        if (active && error?.name !== "RenderingCancelledException") {
          setPageError(`Page ${pageNumber} could not be displayed.`);
          setRendering(false);
        }
      });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pageNumber, pdfDocument, rotation, scale]);

  return (
    <article
      className="moofie-pdf-page"
      ref={(element) => setPageElement(pageNumber, element)}
      aria-label={`Page ${pageNumber}`}
      aria-busy={rendering}
    >
      {rendering && <ContentSkeleton label={`Loading page ${pageNumber}`} variant="document" />}
      {pageError && <p>{pageError}</p>}
      <canvas ref={canvasRef} aria-label={`PDF page ${pageNumber}`} />
    </article>
  );
}

function PdfPreview({ fileUrl, fileBlob, name }) {
  const stageRef = useRef(null);
  const fullscreen = useDocumentFullscreen(stageRef);
  const pagesRef = useRef(null);
  const pageElementsRef = useRef([]);
  const scrollFrameRef = useRef(0);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [autoFit, setAutoFit] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!fileBlob) return undefined;
    let active = true;
    let loadingTask = null;
    setPdfDocument(null);
    setPageNumber(1);
    setRotation(0);
    setAutoFit(true);
    setPreviewError("");
    async function loadPdf() {
      try {
        const [pdfjs, bytes] = await Promise.all([
          import("pdfjs-dist/legacy/build/pdf.mjs"),
          readPdfBytes(fileBlob),
        ]);
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        loadingTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
        const nextDocument = await loadingTask.promise;
        if (active) setPdfDocument(nextDocument);
      } catch (error) {
        if (active) {
          console.error("PDF preview failed:", error?.name, error?.message);
          setPreviewError(pdfErrorMessage(error));
        }
      }
    }

    loadPdf();
    return () => {
      active = false;
      loadingTask?.destroy().catch(() => {});
    };
  }, [fileBlob, retryVersion]);

  useEffect(() => {
    if (!pdfDocument || !stageRef.current || !autoFit) return undefined;
    let active = true;
    let resizeFrame = 0;

    async function fitPage() {
      const page = await pdfDocument.getPage(1);
      if (!active || !stageRef.current) return;
      const natural = page.getViewport({
        scale: 1,
        rotation: (page.rotate + rotation) % 360,
      });
      const horizontalPadding = window.innerWidth <= 760 ? 24 : 64;
      const availableWidth = Math.max(280, stageRef.current.clientWidth - horizontalPadding);
      const comfortablePageWidth = Math.min(920, availableWidth);
      setScale(Math.min(1.4, Math.max(0.5, comfortablePageWidth / natural.width)));
    }

    fitPage();
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(fitPage);
    });
    observer.observe(stageRef.current);
    return () => {
      active = false;
      window.cancelAnimationFrame(resizeFrame);
      observer.disconnect();
    };
  }, [autoFit, pdfDocument, rotation]);

  useEffect(() => () => window.cancelAnimationFrame(scrollFrameRef.current), []);

  const pageCount = pdfDocument?.numPages || 0;

  function changeZoom(amount) {
    setAutoFit(false);
    setScale((current) => Math.min(3, Math.max(0.25, current + amount)));
  }

  function goToPage(nextPage) {
    const targetPage = Math.min(pageCount || 1, Math.max(1, nextPage));
    setPageNumber(targetPage);
    const container = pagesRef.current;
    const page = pageElementsRef.current[targetPage - 1];
    if (container && page) {
      container.scrollTo({ top: Math.max(0, page.offsetTop - 20), behavior: "smooth" });
    }
  }

  function handlePagesScroll() {
    window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      const container = pagesRef.current;
      if (!container) return;
      const readingLine = container.scrollTop + Math.min(180, container.clientHeight * 0.3);
      let visiblePage = 1;
      pageElementsRef.current.forEach((page, index) => {
        if (page && page.offsetTop <= readingLine) visiblePage = index + 1;
      });
      setPageNumber(visiblePage);
    });
  }

  return (
    <section className="moofie-pdf" ref={stageRef} aria-label={`${name} document`}>
      <DocumentToolbar pageNumber={pageNumber} pageCount={pageCount} onPageChange={goToPage}
        scale={scale} autoFit={autoFit} onZoom={changeZoom} onFit={() => setAutoFit(true)}
        onRotate={() => setRotation(value => (value + 90) % 360)} fullscreen={fullscreen.fullscreen}
        onFullscreen={fullscreen.toggle} downloadUrl={fileUrl} name={name} />
      <div className="moofie-pdf-pages" ref={pagesRef} onScroll={handlePagesScroll}>
        {fullscreen.error && <p role="status">{fullscreen.error}</p>}
        {previewError ? <div className="moofie-pdf-error" role="alert"><p>{previewError}</p><button type="button" onClick={() => setRetryVersion(value => value + 1)}>Retry preview</button></div> : !pdfDocument && <ContentSkeleton label="Loading PDF" variant="document" />}
        {pdfDocument && Array.from({ length: pageCount }, (_, index) => (
          <PdfPageCanvas
            key={index + 1}
            pdfDocument={pdfDocument}
            pageNumber={index + 1}
            rotation={rotation}
            scale={scale}
            setPageElement={(number, element) => {
              pageElementsRef.current[number - 1] = element;
            }}
          />
        ))}
      </div>
    </section>
  );
}

function SubmittedAttachment({ attachment, courseId }) {
  const [open, setOpen] = useState(false);
  const preview = useFilePreview(courseId, attachment, open);
  return <div className="submitted-attachment">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Hide" : "View"} {attachment.name}</button>
    {open && <div className="assignment-submission-preview">
      <FilePreview preview={preview} file={attachment} courseId={courseId} PdfPreview={PdfPreview} />
      <FileDownload courseId={courseId} file={attachment} preview={preview}>Download {attachment.name}</FileDownload>
    </div>}
  </div>;
}

function CourseContentViewer({ viewer, loading, error, chrome }) {
  const originalItem = viewer?.item;
  const routeRef = useRef(null);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [contentRevision, setContentRevision] = useState(0);
  const requestedRevision = useRef(0);
  useEffect(() => {
    if (!viewer || viewer.type === "file") return;
    const refresh = () => setContentRevision(value => value + 1);
    const stop = startCanvasAutoRefresh(refresh);
    window.addEventListener("moofie:refresh", refresh);
    return () => { stop(); window.removeEventListener("moofie:refresh", refresh); };
  }, [viewer?.courseId, viewer?.type, originalItem?.id]);
  const readerCloseRef = useRef(null);
  useEffect(() => {
    if (viewer?.type !== "file") return;
    const previousFocus = document.activeElement;
    const app = document.querySelector(".app-frame");
    const previousInert = app?.inert;
    const previousOverflow = document.body.style.overflow;
    if (app) app.inert = true;
    document.body.style.overflow = "hidden";
    readerCloseRef.current?.focus();
    return () => {
      if (app) app.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [viewer?.type]);
  useEffect(() => {
    setPageLoading(false);
    setPageError("");
    const force = requestedRevision.current !== contentRevision;
    requestedRevision.current = contentRevision;
    const pageRequest = viewer?.type === "page" && (originalItem?.body == null || force) && originalItem?.pageUrl;
    const contentRequest = (originalItem?.needsDetails || force) && ["quiz", "discussion", "file"].includes(viewer?.type);
    if (!pageRequest && !contentRequest) return;
    let active = true;
    const entryId = readNavigation().moofieEntryId;
    if (originalItem?.needsDetails || originalItem?.body == null) setPageLoading(true);
    (pageRequest ? loadCoursePage(viewer.courseId, originalItem.pageUrl) : loadCourseContent(viewer.courseId, viewer.type, originalItem.id))
      .then(page => {
        if (active && readNavigation().moofieEntryId === entryId) {
          writeNavigation({ moofieViewer: { ...viewer, item: page, baseUrl: page.htmlUrl } }, { replace: true });
        }
      })
      .catch(requestError => { if (active) setPageError(requestError.message || "Moofie could not load this page."); })
      .finally(() => { if (active) setPageLoading(false); });
    return () => { active = false; };
  }, [viewer?.courseId, viewer?.type, originalItem, contentRevision]);
  const [assignment, setAssignment] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [submissionType, setSubmissionType] = useState("");
  const [submissionFile, setSubmissionFile] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const filePreview = useFilePreview(viewer?.courseId, originalItem, viewer?.type === "file");
  const filePreviewLoading = filePreview.loading;
  const submissionPanelRef = useRef(null);
  const assignmentIdentityRef = useRef("");

  useEffect(() => {
    setAssignment(current => current?.id === originalItem?.id ? current : originalItem || null);
    setDetailsError("");
    const identity = `${viewer?.courseId}:${originalItem?.id}`;
    if (assignmentIdentityRef.current !== identity) {
      assignmentIdentityRef.current = identity;
      setSubmitError(""); setSubmitSuccess(""); setSubmissionFile(null); setIsDraggingFile(false);
    }
    if (viewer?.type !== "assignment" || !viewer.courseId || !originalItem?.id) return;

    let active = true;
    setDetailsLoading(true);
    loadAssignmentDetails(viewer.courseId, originalItem.id)
      .then((details) => {
        if (active) setAssignment(details);
      })
      .catch((requestError) => {
        if (active) {
          setDetailsError(
            requestError.message === "Unknown action."
              ? ""
              : requestError.message || "Moofie could not load the full assignment.",
          );
        }
      })
      .finally(() => {
        if (active) setDetailsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [originalItem, viewer?.courseId, viewer?.type, contentRevision]);

  useEffect(() => {
    if (!viewer || pageLoading || detailsLoading || filePreviewLoading) return;
    const frame = requestAnimationFrame(() => {
      if (routeRef.current) routeRef.current.scrollTop = readNavigation().moofieContentScrollY || 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [viewer, pageLoading, detailsLoading, filePreviewLoading]);

  useEffect(() => {
    if (!viewer) return;
    const closeOnEscape = event => {
      if (event.key === "Escape") window.history.go(viewer.type === "file" ? -(viewer.readerDepth || 1) : -1);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [viewer]);

  const item = viewer?.type === "assignment" ? assignment || originalItem : originalItem;
  const supportedSubmissionTypes = (item?.submissionTypes || []).filter((type) =>
    type === "online_upload",
  );
  const isExternalToolAssignment = (item?.submissionTypes || []).includes("external_tool");

  useEffect(() => {
    if (!supportedSubmissionTypes.length) {
      setSubmissionType("");
      return;
    }
    setSubmissionType((current) =>
      supportedSubmissionTypes.includes(current) ? current : supportedSubmissionTypes[0],
    );
  }, [supportedSubmissionTypes.join("|")]);

  if (!viewer && !loading && !error) return null;

  async function handleAssignmentSubmit(event) {
    event.preventDefault();
    if (!viewer?.courseId || !item?.id || !submissionType) return;
    if (!window.confirm(item.submitted ? "Submit a new attempt to Canvas?" : "Submit this assignment to Canvas?")) return;

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");
    try {
      const submission = { type: submissionType };
      if (submissionType === "online_upload") {
        if (!submissionFile) throw new Error("Choose a file to submit.");
        if (submissionFile.size > 20_000_000) throw new Error("Choose a file smaller than 20 MB.");
        submission.file = {
          name: submissionFile.name,
          contentType: submissionFile.type || "application/octet-stream",
          base64: await fileAsBase64(submissionFile),
        };
      }
      const updated = await submitCanvasAssignment(viewer.courseId, item.id, submission);
      setAssignment(updated);
      setSubmitSuccess("Submitted successfully.");
      setSubmissionFile(null);
    } catch (submissionError) {
      setSubmitError(submissionError.message || "Moofie could not submit this assignment.");
    } finally {
      setSubmitting(false);
    }
  }

  function chooseSubmissionFile(file) {
    setSubmitError("");
    setSubmitSuccess("");
    if (!file) {
      setSubmissionFile(null);
      return;
    }
    if (file.size > 20_000_000) {
      setSubmissionFile(null);
      setSubmitError("Choose a file smaller than 20 MB.");
      return;
    }
    const extension = file.name.includes(".")
      ? file.name.split(".").pop().toLowerCase()
      : "";
    if (
      item?.allowedExtensions?.length &&
      !item.allowedExtensions.map((value) => value.toLowerCase()).includes(extension)
    ) {
      setSubmissionFile(null);
      setSubmitError(`Choose one of these file types: ${acceptedFileTypes}.`);
      return;
    }
    setSubmissionFile(file);
  }

  function navigateFromViewer(nextView) {
    chrome?.onNavigate(nextView);
  }

  function navigateToCourseSection(tab) {
    chrome?.courseNavigation?.onSelect(tab);
  }

  const assignmentStatus = item?.graded
    ? "Graded"
    : item?.submitted
      ? "Submitted"
    : item?.missing
      ? "Missing"
      : "Not submitted";
  const acceptedFileTypes = item?.allowedExtensions?.length
    ? item.allowedExtensions.join(", ")
    : "Any file type";
  const now = Date.now();
  const unlockTime = item?.unlockAt ? new Date(item.unlockAt).getTime() : null;
  const lockTime = item?.lockAt ? new Date(item.lockAt).getTime() : null;
  const isAssignmentLocked = Boolean(
    item?.locked ||
      (Number.isFinite(unlockTime) && now < unlockTime) ||
      (Number.isFinite(lockTime) && now > lockTime),
  );
  const lockedMessage = Number.isFinite(unlockTime) && now < unlockTime
      ? `Locked until ${formatDueDate(item.unlockAt)}`
      : Number.isFinite(lockTime) && now > lockTime
        ? `Closed ${formatDueDate(item.lockAt)}`
        : "Locked by your instructor";
  const assignmentAccessStatus = isAssignmentLocked ? lockedMessage : "Open";
  const assignmentStatusDate = item?.graded
    ? item?.gradedAt
    : item?.submitted
      ? item?.submission?.submittedAt
      : null;
  const submissionMethod = isExternalToolAssignment
    ? "External tool"
    : supportedSubmissionTypes.length
      ? "File upload"
      : "No online submission";
  const earnedPoints = Number(item?.earned);
  const possiblePoints = Number(item?.points);
  const hasPointGrade = item?.earned !== null &&
    item?.earned !== undefined &&
    Number.isFinite(earnedPoints) &&
    Number.isFinite(possiblePoints) &&
    possiblePoints > 0;
  const gradeSummary = item?.graded
    ? hasPointGrade
      ? `${formatPoints(earnedPoints)}/${formatPoints(possiblePoints)} points (${formatPercent((earnedPoints / possiblePoints) * 100)})`
      : String(item?.grade || "Graded")
    : "Not graded";

  if (viewer?.type === "file") {
    const files = (chrome?.files || []).filter(file => !file.locked).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const index = files.findIndex(file => String(file.id) === String(item.id));
    const previousFile = index > 0 ? files[index - 1] : null;
    const nextFile = index >= 0 ? files[index + 1] : null;
    const close = () => window.history.go(-(viewer.readerDepth || 1));
    const openFile = file => writeNavigation({ moofieViewer: { ...viewer, item: file, readerDepth: (viewer.readerDepth || 1) + 1 } });
    return createPortal(
      <section className="document-reader" aria-label={item.name}>
        <header className="document-reader-header">
          <svg className="document-reader-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6" /></svg>
          <h1 title={item.name}>{item.name}</h1>
          <div className="document-reader-actions">
            <details className="document-reader-info"><summary aria-label="File information" title="File information"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg></summary><div><strong>{item.name}</strong><span>{formatFileSize(item.size)}</span>{item.updatedAt && <span>Modified {formatResourceDate(item.updatedAt)}</span>}</div></details>
            <FileDownload key={item.id} courseId={viewer.courseId} file={item} preview={filePreview} aria-label="Download file" title="Download"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></svg></FileDownload>
            <button ref={readerCloseRef} type="button" onClick={close} aria-label="Close document" title="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
          </div>
        </header>
        <div className="document-reader-content">
          {pageError ? <div className="document-reader-message" role="alert">{pageError}</div> : <FilePreview preview={filePreview} file={item} courseId={viewer.courseId} PdfPreview={PdfPreview} />}
        </div>
        <footer className="document-reader-footer"><div><button type="button" disabled={!previousFile} onClick={() => openFile(previousFile)} title={previousFile?.name}>← Previous</button><button type="button" disabled={!nextFile} onClick={() => openFile(nextFile)} title={nextFile?.name}>Next →</button></div><button type="button" onClick={close}>Close</button></footer>
      </section>, document.body,
    );
  }

  return createPortal(
    <div className="course-content-route" ref={routeRef}>
      {chrome && (
        <SignedInNav
          activeView={chrome.activeView}
          data={chrome.data}
          user={chrome.user}
          onNavigate={navigateFromViewer}
          disconnect={chrome.disconnect}
          signOut={chrome.signOut}
          deleteAccount={chrome.deleteAccount}
        />
      )}
      <div className={`course-content-layout ${chrome?.courseNavigation ? "has-course-navigation" : ""} ${viewer?.type === "file" ? "is-file-preview" : ""}`}>
        {chrome?.courseNavigation?.items?.length ? (
          <aside className="course-content-navigation" aria-label="Course navigation">
            {chrome.courseIdentity && (
              <div className="course-content-identity">
                <strong>{chrome.courseIdentity.name}</strong>
                {chrome.courseIdentity.instructor && (
                  <span>{chrome.courseIdentity.instructor}</span>
                )}
              </div>
            )}
            <CourseNavigation
              activeSection={viewer?.sectionId}
              items={chrome.courseNavigation.items}
              onSelect={navigateToCourseSection}
            />
          </aside>
        ) : null}
        <section
          className={`course-viewer ${viewer?.type === "assignment" ? "assignment-viewer" : ""}`}
          aria-labelledby="course-viewer-title"
        >
        {viewer?.type === "page" && chrome?.courseNavigation && (
          <div className="pages-actions"><button type="button" onClick={() => chrome.courseNavigation.onSelect({ section: "course-pages", allPages: true })}>View All Pages</button></div>
        )}
        <header>
          <div>
            <span>{viewer?.label || "Course content"}</span>
            <h2 id="course-viewer-title">{viewer?.type === "person" ? "Profile" : item?.title || item?.name || "Loading…"}</h2>
          </div>
        </header>

        <div className="course-viewer-body">
          {pageError && !originalItem?.needsDetails && (viewer?.type !== "page" || originalItem?.body != null) && <p className="course-sync-notice" role="status">This content could not refresh. Showing the last successful load. <button type="button" onClick={() => setContentRevision(value => value + 1)}>Check Canvas now</button></p>}
          {loading || pageLoading ? (
            <ContentSkeleton label="Loading course content…" variant="list" />
          ) : error || pageError && (originalItem?.needsDetails || viewer?.type === "page" && originalItem?.body == null) ? (
            <div className="home-resource-error">{error || pageError}</div>
          ) : viewer?.type === "person" ? (
            <CoursePerson key={`${viewer.courseId}:${item.id}`} courseId={viewer.courseId} person={item} availableCourses={chrome?.data?.courses} />
          ) : viewer?.type === "assignment" ? (
            <div className="native-assignment-view">
              <div className="native-assignment-facts">
                <span className="assignment-access-fact"><strong>{assignmentAccessStatus}</strong></span>
                <span><small>Due</small><strong>{formatDueDate(item?.dueAt)}</strong></span>
                <span><small>Points</small><strong>{formatPoints(Number(item?.points) || 0)}</strong></span>
                <span><small>Submitting</small><strong>{submissionMethod}</strong></span>
                {!isExternalToolAssignment && <span><small>File types</small><strong>{acceptedFileTypes}</strong></span>}
                {supportedSubmissionTypes.length > 0 && !detailsLoading && !isAssignmentLocked && (
                  <button
                    className="assignment-facts-action"
                    type="button"
                    onClick={() => submissionPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  >
                    {item?.submitted ? "New attempt" : "Submit assignment"}
                  </button>
                )}
              </div>
              {detailsError && <div className="home-resource-error">{detailsError}</div>}
              <div className="assignment-page-grid">
                <section className="assignment-submission-panel" ref={submissionPanelRef}>
                  <div className="assignment-section-heading">
                    <h3>Submission</h3>
                  </div>
                  {detailsLoading ? (
                    <ContentSkeleton label="Loading assignment details…" variant="text" />
                  ) : (
                    <>
                    <div className="assignment-submission-details">
                      <dl>
                        <div>
                          <dt>Status:</dt>
                          <dd>
                            <span>{assignmentStatus}</span>
                            {assignmentStatusDate && (
                              <small>{formatDueDate(assignmentStatusDate)}</small>
                            )}
                          </dd>
                        </div>
                        <div><dt>Grade:</dt><dd>{gradeSummary}</dd></div>
                      </dl>
                      <details className="submission-detail-disclosure">
                        <summary>Submission Details</summary>
                        <dl>
                          <div><dt>Attempt:</dt><dd>{item?.submission?.attempt || "No submission"}</dd></div>
                          <div><dt>Submitted:</dt><dd>{item?.submission?.submittedAt ? formatDueDate(item.submission.submittedAt) : "Not submitted"}</dd></div>
                          <div><dt>Graded:</dt><dd>{item?.submission?.gradedAt ? formatDueDate(item.submission.gradedAt) : "Not yet graded"}</dd></div>
                        </dl>
                        {item?.submission?.body && <SafeCourseHtml html={item.submission.body} baseUrl={item.htmlUrl} />}
                        {item?.submission?.url && <a href={item.submission.url} target="_blank" rel="noreferrer">Submitted website</a>}
                        {item?.submission?.history?.length > 1 && <div><h4>Submission history</h4>{item.submission.history.map((attempt, index) => <p key={index}>Attempt {attempt.attempt}: {attempt.submittedAt ? formatDueDate(attempt.submittedAt) : "Not submitted"}{attempt.grade != null ? ` · Grade: ${attempt.grade}` : ""}</p>)}</div>}
                      </details>
                      <div className="submission-comments">
                        <h4>Comments</h4>
                        {item?.submission?.comments == null ? <p>Comments are not available yet.</p> : item.submission.comments.length === 0 ? <p>No Comments</p> : item.submission.comments.map(comment => <article key={comment.id}><strong>{comment.author}</strong>{comment.createdAt && <small>{formatDueDate(comment.createdAt)}</small>}<p>{comment.text}</p></article>)}
                      </div>
                    </div>
                    {item?.submission?.attachments?.length > 0 && (
                      <div className="submitted-attachments">
                        {item.submission.attachments.map((attachment) => (
                          <SubmittedAttachment
                            key={attachment.id}
                            attachment={attachment}
                            courseId={viewer.courseId}
                          />
                        ))}
                      </div>
                    )}
                    {supportedSubmissionTypes.length > 0 && !isAssignmentLocked && (
                    <form onSubmit={handleAssignmentSubmit}>
                      <p className="submission-help">
                        Upload one {acceptedFileTypes === "Any file type" ? "file" : acceptedFileTypes.toUpperCase()} file from your device.
                      </p>
                      {submissionType === "online_upload" && (
                        <label
                          className={`submission-file-picker ${isDraggingFile ? "is-dragging" : ""}`}
                          onDragEnter={(event) => { event.preventDefault(); setIsDraggingFile(true); }}
                          onDragOver={(event) => event.preventDefault()}
                          onDragLeave={() => setIsDraggingFile(false)}
                          onDrop={(event) => {
                            event.preventDefault();
                            setIsDraggingFile(false);
                            chooseSubmissionFile(event.dataTransfer.files?.[0] || null);
                          }}
                        >
                          <b aria-hidden="true">↑</b>
                          <span>{submissionFile ? submissionFile.name : "Drag a file here"}</span>
                          <small>{submissionFile ? `${formatFileSize(submissionFile.size)} selected` : "or choose a file from your device"}</small>
                          <small>Maximum 20 MB · {acceptedFileTypes}</small>
                          <input type="file" accept={item?.allowedExtensions?.length ? item.allowedExtensions.map((extension) => `.${extension}`).join(",") : undefined} onChange={(event) => chooseSubmissionFile(event.target.files?.[0] || null)} required />
                        </label>
                      )}
                      {submitError && <p className="submission-message error" role="alert">{submitError}</p>}
                      {submitSuccess && <p className="submission-message success">{submitSuccess}</p>}
                      <button className="submit-assignment-button" type="submit" disabled={submitting || !submissionFile}>
                        {submitting ? "Submitting…" : item?.submitted ? "Submit new attempt" : "Submit assignment"}
                      </button>
                    </form>
                    )}
                    </>
                  )}
                </section>
                <section className="assignment-instructions">
                  <div className="assignment-section-heading">
                    <h3>Instructions</h3>
                  </div>
                  {detailsLoading ? (
                    <ContentSkeleton label="Loading instructions…" variant="text" />
                  ) : item?.description ? (
                    <SafeCourseHtml html={item.description} baseUrl={item.htmlUrl || viewer?.baseUrl} />
                  ) : (
                    <p className="native-course-empty">Your instructor did not add written instructions.</p>
                  )}
                  {isExternalToolAssignment && item?.externalLaunchUrl && !detailsLoading && (
                    <a className="external-assignment-link" href={item.externalLaunchUrl} rel="noreferrer" target="_blank">
                      Open {item.title}
                    </a>
                  )}
                </section>
              </div>
            </div>
          ) : viewer?.type === "discussion" || viewer?.type === "announcement" ? (
            <article
              className={`native-discussion ${viewer?.type === "announcement" ? "native-announcement" : ""}`}
            >
              {(item?.authorName || item?.author || item?.authorAvatarUrl) && (
                <div className="native-discussion-author">
                  <CourseAuthorAvatar
                    name={item.authorName || item.author}
                    src={item.authorAvatarUrl}
                  />
                  <div>
                    <strong>{item.authorName || item.author || "Course author"}</strong>
                    <small>{formatResourceDate(item.postedAt, true)}</small>
                  </div>
                </div>
              )}
              <SafeCourseHtml
                html={item?.message}
                baseUrl={item?.htmlUrl || viewer?.baseUrl}
              />
            </article>
          ) : (
            viewer?.type === "course-tool" ? <CourseTool key={`${viewer.courseId}:${item?.toolId}`} courseId={viewer.courseId} toolId={item?.toolId} title={item?.title} renderPdf={(blob, name) => <PdfPreview fileBlob={blob} name={name} />} /> :
            <>{viewer?.type === "quiz" && <div className="quiz-detail-meta">{quizMetadata(item || {}).map((label, index) => <span key={index}>{label}</span>)}</div>}<SafeCourseHtml html={item?.body || item?.message || item?.description} baseUrl={item?.htmlUrl || viewer?.baseUrl} /></>
          )}
        </div>
        </section>
      </div>
      <SiteFooter />
    </div>,
    document.body,
  );
}

function HomeDashboard({
  resourcesByCourse,
  setResourcesByCourse,
  data,
  user,
  refreshFeedback,
  onNavigate,
  disconnect,
  signOut,
  deleteAccount,
}) {
  const [selectedCourseId, setSelectedCourseId] = useHistoryState("moofieHomeCourse", null);
  const [loadingCourseId, setLoadingCourseId] = useState(null);
  const [resourceError, setResourceError] = useState("");
  const [viewer, setViewer] = useHistoryState("moofieViewer", null, true);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState("");
  const [activeCourseSection, setActiveCourseSection] = useHistoryState("moofieHomeSection", "course-overview");
  useEffect(() => {
    // Repair history entries created by the old /assignments/:anything matcher.
    if (viewer?.type === "assignment" && viewer.item?.id === "syllabus") {
      writeNavigation({ ...closedContent, moofieHomeSection: "course-syllabus", moofieView: "home" }, { replace: true });
    }
  }, [viewer]);
  const [showAllPages] = useHistoryState("moofiePagesIndex", false);
  const selectedCourse = data.courses.find(
    (course) => course.id === selectedCourseId,
  );
  const resources = selectedCourse
    ? resourcesByCourse[selectedCourse.id]
    : null;

  const visibleCourseSection = courseContentSection(activeCourseSection, resources?.course);
  const sectionStatus = courseSectionStatus(resources, visibleCourseSection);

  useEffect(() => {
    if (
      selectedCourseId &&
      !data.courses.some((course) => course.id === selectedCourseId)
    ) {
      setSelectedCourseId(null);
    }
  }, [data.courses, selectedCourseId]);

  useEffect(() => {
    function restoreHomeCourse(event) {
      setViewerLoading(false);
      setViewerError("");
    }
    window.addEventListener("popstate", restoreHomeCourse);
    return () => window.removeEventListener("popstate", restoreHomeCourse);
  }, []);

  function navigateHome(nextView) {
    onNavigate(nextView);
  }

  useEffect(() => {
    if (!selectedCourseId) return;
    let active = true, running = false;
    async function refreshCourse() {
      if (running) return;
      running = true;
      setLoadingCourseId(selectedCourseId); setResourceError("");
      try {
        const next = await loadCourseResources(selectedCourseId);
        if (active) setResourcesByCourse(current => ({ ...current, [selectedCourseId]: mergeCourseResources(current[selectedCourseId], next) }));
      } catch (error) { if (active) setResourceError(error.message || "This course could not refresh. Previously loaded data is still shown."); }
      finally { running = false; if (active) setLoadingCourseId(null); }
    }
    refreshCourse();
    const stop = startCanvasAutoRefresh(refreshCourse);
    const manual = () => { clearCanvasReadCache(); refreshCourse(); };
    window.addEventListener("moofie:refresh", manual);
    return () => { active = false; stop(); window.removeEventListener("moofie:refresh", manual); };
  }, [selectedCourseId]);

  function openViewer(type, label, item, options = {}) {
    setViewer({
      type,
      label,
      item,
      courseId: options.courseId ?? selectedCourse?.id ?? item?.courseId,
      returnView: "home",
      sectionId: activeCourseSection,
      ...options,
    });
    setViewerError("");
    setViewerLoading(false);
  }

  function openPage(page) {
    if (!selectedCourse) return;
    openViewer("page", formatCourseDisplayName(selectedCourse.name), page);
  }

  const courseNavigationTabs = resources ? buildCourseNavigation(resources.tabs, resources.course?.homeUrl, selectedCourse?.name) : [];
  const courseNavigationItems = courseNavigationTabs;

  function openNativeSection(sectionId) {
    if (sectionId === "course-grades") {
      onNavigate("grades");
      return;
    }
    if (activeCourseSection === sectionId && !viewer && !(sectionId === "course-pages" && showAllPages)) return;
    writeNavigation({
      ...closedContent,
      moofieHomeCourse: selectedCourseId,
      moofieHomeSection: sectionId,
      moofieView: "home",
      ...(sectionId === "course-pages" ? { moofiePagesIndex: false } : {}),
    });
    setViewerLoading(false);
    setViewerError("");
  }

  function selectCourseNavigation(tab) {
    if (tab.section === "course-pages" && tab.allPages) {
      writeNavigation({ ...closedContent, moofieView: "home", moofieHomeCourse: selectedCourseId, moofieHomeSection: "course-pages", moofiePagesIndex: true });
      return;
    }
    if (tab.section) {
      openNativeSection(tab.section);
      return;
    }
    const destination = tab.destination;
    if (destination?.kind === "quizzes" || destination?.kind === "discussion_topics") {
      const collection = destination.kind === "quizzes" ? resources.quizzes : resources.discussions;
      const item = collection?.find(item => String(item.id) === destination.id);
      if (item) openViewer(destination.kind === "quizzes" ? "quiz" : "discussion", tab.label, item, { courseId: destination.courseId, sectionId: tab.navigationKey });
      return;
    }
    if (destination?.kind === "pages") {
      openViewer("page", tab.label, { title: tab.label, pageUrl: destination.id }, { courseId: destination.courseId });
      return;
    }
    if (destination?.kind === "files") {
      const file = resources.files?.find(file => String(file.id) === destination.id);
      openViewer("file", tab.label, file || { id: destination.id, name: tab.label }, { courseId: destination.courseId });
      return;
    }
    if (destination?.kind === "assignments") {
      openViewer("assignment", tab.label, { id: destination.id, title: tab.label }, { courseId: destination.courseId });
      return;
    }
    if (tab.id === "syllabus") {
      openViewer("page", tab.label, { title: tab.label, body: resources.course?.syllabusBody || "<p>No syllabus has been published.</p>" });
      return;
    }
    openViewer("course-tool", "Course tool", { title: tab.label, toolId: destination?.toolId }, { sectionId: tab.navigationKey });
  }

  function openActivity(item) {
    const announcement = resources.announcements.find(entry => entry.id === item.announcementId);
    if (announcement) return openViewer("announcement", "Announcement", announcement);
    if (item.discussionId) return openViewer("discussion", "Discussion", { id: item.discussionId, title: item.title, needsDetails: true });
    if (item.assignmentId) return openViewer("assignment", "Assignment", { id: item.assignmentId, title: item.title });
    // The stream message is plain text, not instructor HTML.
    const body = item.message.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
    return openViewer("page", "Recent Activity", { title: item.title, body: "<p>" + body + "</p>" });
  }

  function moduleItemAction(item) {
    if (!resources) return {};
    if (item.type === "Assignment" && item.contentId) {
      const assignment = selectedCourse?.assignments.find(
        (candidate) => String(candidate.id) === String(item.contentId),
      ) || {
        id: item.contentId,
        courseId: selectedCourse?.id,
        title: item.title,
      };
      return {
        onClick: () =>
          openViewer(
            "assignment",
            formatCourseDisplayName(selectedCourse.name),
            assignment,
          ),
      };
    }
    if (item.locked && item.type !== "Quiz" && item.type !== "Discussion") return {};
    if (item.type === "File") {
      const file = resources.files.find(
        (candidate) => String(candidate.id) === String(item.contentId),
      );
      return { onClick: () => openViewer("file", "Course file", file || { id: item.contentId, name: item.title, needsDetails: true }) };
    }
    if (item.type === "Page") {
      const page = resources.pages.find(
        (candidate) => candidate.pageUrl === item.pageUrl,
      );
      return { onClick: () => openPage(page || { pageUrl: item.pageUrl, title: item.title }) };
    }
    if (item.type === "Discussion") {
      const discussion = resources.discussions?.find(
        (candidate) => String(candidate.id) === String(item.contentId),
      );
      return { onClick: () => openViewer("discussion", "Discussion", discussion || { id: item.contentId, title: item.title, needsDetails: true }) };
    }
    if (item.type === "Quiz") {
      const quiz = resources.quizzes?.find(
        (candidate) => String(candidate.id) === String(item.contentId),
      );
      return { onClick: () => openViewer("quiz", "Quiz", quiz || { id: item.contentId, title: item.title, needsDetails: true }) };
    }
    if (item.externalUrl) {
      const patch = canvasLinkNavigation(item.externalUrl, resources.course.homeUrl, item.title);
      if (patch) return { onClick: () => writeNavigation(patch) };
      if (new URL(item.externalUrl).origin !== new URL(resources.course.homeUrl).origin) return { href: item.externalUrl };
    }

    return {
      onClick: () =>
        openViewer("module-item", item.type || "Course item", {
          title: item.title,
          body: "<p>This course item does not include content that Canvas makes available to Moofie.</p>",
        }),
    };
  }

  function moduleItemMetadata(item) {
    const assignment = item.type === "Assignment"
      ? selectedCourse?.assignments?.find(
          (candidate) => String(candidate.id) === String(item.contentId),
        )
      : null;
    const quiz = item.type === "Quiz"
      ? resources?.quizzes?.find(
          (candidate) => String(candidate.id) === String(item.contentId),
        )
      : null;
    const dueAt = item.dueAt || assignment?.dueAt || quiz?.dueAt || null;
    const rawPoints = item.points ?? assignment?.points ?? quiz?.points;
    const points = rawPoints === null || rawPoints === undefined
      ? null
      : Number(rawPoints);

    return {
      dueAt,
      points: Number.isFinite(points) ? points : null,
    };
  }

  const sortedAssignments = sortCourseAssignments(selectedCourse?.assignments || []);
  const courseHomeBody =
    resources?.course?.homeBody || "";
  const courseHomeBaseUrl =
    resources?.course?.homePageUrl || resources?.course?.homeUrl;

  return (
    <main
      className={`grades-shell home-shell pull-${refreshFeedback.phase}`}
      style={{ "--page-pull": `${refreshFeedback.distance}px` }}
    >
      <RefreshFeedback feedback={refreshFeedback} />
      <SignedInNav
        activeView="home"
        data={data}
        user={user}
        onNavigate={navigateHome}
        disconnect={disconnect}
        signOut={signOut}
        deleteAccount={deleteAccount}
      />

      <section className={`home-content ${selectedCourse ? "is-course-open" : ""}`}>
        {!selectedCourse && (
          <header className="home-heading">
            <p className="eyeline">{data.profile.short_name || data.profile.name}</p>
            <h1>Home</h1>
          </header>
        )}

        {data.courses.length === 0 ? (
          <div className="empty-card">
            <div>
              <h2>No active courses</h2>
              <p>Your active Canvas courses will appear here when available.</p>
            </div>
          </div>
        ) : (
          <>
            {!selectedCourse && (
            <section className="home-course-picker" aria-label="Courses">
              {data.courses.map((course) => (
                <button
                  className={course.id === selectedCourseId ? "is-active" : ""}
                  type="button"
                  key={course.id}
                  onClick={() => {
                    setResourceError("");
                    writeNavigation({
                      ...closedContent,
                      moofieHomeCourse: course.id,
                      moofieHomeSection: "course-overview",
                      moofieView: "home",
                      moofieFileFolder: null,
                      moofiePagesIndex: false,
                      moofieFileQuery: "",
                      moofieFileSort: null,
                    });
                  }}
                >
                  <span className="course-picker-copy">
                    <strong>{formatCourseDisplayName(course.name)}</strong>
                    <small>{course.instructor}</small>
                  </span>
                  <span className="course-picker-open">Open course <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span>
                </button>
              ))}
            </section>
            )}

            {selectedCourse && (
              <section className="home-course-content">
                <aside className="home-course-sidebar">
                  <div className="home-course-heading">
                    <div>
                      <h2>{formatCourseDisplayName(selectedCourse.name)}</h2>
                      <span>{selectedCourse.instructor}</span>
                    </div>
                  </div>
                  {resources && (
                    <section className="home-resource-section course-navigation-section">
                      <div className="home-resource-title">
                        <div>
                          <span>Everything available</span>
                          <h3>Course navigation</h3>
                        </div>
                        <strong>{courseNavigationTabs.length}</strong>
                      </div>
                      {courseNavigationItems.length ? (
                        <CourseNavigation
                          activeSection={activeCourseSection}
                          items={courseNavigationItems}
                          onSelect={selectCourseNavigation}
                        />
                      ) : (
                        <div className="home-course-navigation">
                          <p className="home-resource-empty">
                            No additional course tools are available.
                          </p>
                        </div>
                      )}
                    </section>
                  )}
                </aside>

                {resourceError && <div className="home-resource-error" role="status">{resourceError} <button type="button" onClick={() => window.dispatchEvent(new Event("moofie:refresh"))}>Check Canvas now</button></div>}

                {!resources && loadingCourseId === selectedCourse.id ? (
                  <ContentSkeleton label="Loading course content" />
                ) : resources ? (
                  <div className="home-resource-grid" data-canvas-restricted={["restricted", "unavailable"].includes(sectionStatus) || undefined}>
                    {resources._sync?.checkedAt && <div className="course-sync-summary">Checked against Canvas at {new Date(resources._sync.checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{resources._sync.partial ? " · Some sections could not refresh" : ""}</div>}
                    {sectionStatus && sectionStatus !== "current" && <div className="course-sync-notice" role="status"><p>{sectionStatus === "restricted" ? "Canvas does not currently allow your account to read this section." : sectionStatus === "unavailable" ? "Canvas did not return this section. Its availability may have changed." : "This section could not refresh. Previously loaded content may be out of date. Moofie will retry automatically."}</p><button type="button" onClick={() => window.dispatchEvent(new Event("moofie:refresh"))}>Check Canvas now</button></div>}
                    <section className="home-resource-section activity-section" id="course-activity" hidden={visibleCourseSection !== "course-activity"}>
                      <div className="home-resource-title"><h3>Recent Activity</h3></div>
                      <div className="home-resource-list">{resources.activity?.length ? resources.activity.map(item => <ResourceRow key={item.id} onClick={() => openActivity(item)}>
                        <span className="home-resource-type-icon"><CourseItemIcon type={item.type} /></span>
                        <span className="home-resource-copy"><strong>{item.title}</strong><small>{item.type} · {formatResourceDate(item.updatedAt, true)}</small><p>{item.message}</p></span>
                      </ResourceRow>) : <p className="home-resource-empty">No Recent Messages</p>}</div>
                    </section>

                    <section
                      className="home-resource-section course-overview-section"
                      id="course-overview"
                      hidden={visibleCourseSection !== "course-overview"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Course home</span>
                          <h3>{resources.course?.homeTitle || resources.course?.name || formatCourseDisplayName(selectedCourse.name)}</h3>
                        </div>
                      </div>
                      {resources.course?.showHomeAnnouncements && <div className="home-recent-announcements"><h4>Recent Announcements</h4>{resources.announcements.slice(0, resources.course.homeAnnouncementLimit).map(item => <ResourceRow key={item.id} onClick={() => openViewer("announcement", "Announcement", item)}><span className="home-resource-copy"><strong>{item.title}</strong><small>{formatResourceDate(item.postedAt, true)}</small></span></ResourceRow>)}</div>}
                      <div className="home-overview-body">
                        {courseHomeBody ? (
                          <SafeCourseHtml
                            html={courseHomeBody}
                            baseUrl={courseHomeBaseUrl}
                          />
                        ) : (
                          <p>This course front page has no published content.</p>
                        )}
                      </div>
                    </section>

                    <section
                      className="home-resource-section announcements-section"
                      id="course-announcements"
                      hidden={visibleCourseSection !== "course-announcements"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Updates</span>
                          <h3>Announcements</h3>
                        </div>
                      </div>
                      <div className="home-resource-list">
                        {resources.announcements.length ? (
                          resources.announcements.map((announcement) => (
                            <ResourceRow
                              key={announcement.id}
                              onClick={() =>
                                openViewer("announcement", "Announcement", announcement)
                              }
                            >
                              <CourseAuthorAvatar
                                className="home-resource-avatar"
                                name={announcement.author}
                                src={announcement.authorAvatarUrl}
                              />
                              <span className="home-resource-copy">
                                <strong>{announcement.title}</strong>
                                <small>
                                  {announcement.author
                                    ? `${announcement.author} · `
                                    : ""}
                                  {formatResourceDate(announcement.postedAt, true)}
                                </small>
                                <p>{announcementText(announcement.message)}</p>
                              </span>
                            </ResourceRow>
                          ))
                        ) : (
                          <p className="home-resource-empty">No announcements.</p>
                        )}
                      </div>
                    </section>

                    <section
                      className="home-resource-section modules-section"
                      id="course-modules"
                      hidden={visibleCourseSection !== "course-modules"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Course order</span>
                          <h3>Modules</h3>
                        </div>
                        <strong>{resources.modules.length}</strong>
                      </div>
                      <CourseModules key={selectedCourse.id} modules={resources.modules} renderItem={item => {
                        if (item.type === "SubHeader") return <div className="home-module-subheader">{item.title}</div>;
                        const action = moduleItemAction(item);
                        const metadata = moduleItemMetadata(item);
                        return <ResourceRow className={item.completed ? "is-completed" : ""} href={action.href} onClick={action.onClick}>
                          <span className="home-resource-type-icon"><CourseItemIcon type={item.type} /></span>
                          <span className="home-resource-copy"><strong>{item.title}</strong>
                            {(metadata.dueAt || metadata.points !== null) && <span className="home-resource-meta">
                              {metadata.dueAt && <small>{formatModuleDate(metadata.dueAt)}</small>}
                              {metadata.points !== null && <small>{formatPoints(metadata.points)} pts</small>}
                            </span>}
                          </span>
                        </ResourceRow>;
                      }} />
                    </section>

                    <section
                      className="home-resource-section files-section"
                      id="course-files"
                      hidden={visibleCourseSection !== "course-files"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Downloads</span>
                          <h3>Files</h3>
                        </div>
                        <strong>{resources.files.length}</strong>
                      </div>
                      <CourseFiles key={selectedCourse.id} files={resources.files} folders={resources.folders} courseName={formatCourseDisplayName(selectedCourse.name)} onOpen={file => openViewer("file", "Course file", file)} />
                    </section>

                    <section
                      className="home-resource-section pages-section"
                      id="course-pages"
                      hidden={visibleCourseSection !== "course-pages"}
                    >
                      {!showAllPages && resources.course?.hasFrontPage ? (
                        <>
                          <div className="pages-actions">
                            <button type="button" onClick={() => selectCourseNavigation({ section: "course-pages", allPages: true })}>View All Pages</button>
                            <span className="pages-front-label">Front Page</span>
                          </div>
                          <div className="home-resource-title">
                            <h3>{resources.course.homeTitle || "Front page"}</h3>
                          </div>
                          <SafeCourseHtml html={resources.course.homeBody} baseUrl={resources.course.homePageUrl || resources.course.homeUrl} />
                        </>
                      ) : (
                        <>
                      {resources.course?.hasFrontPage && <div className="pages-actions"><button type="button" onClick={() => openNativeSection("course-pages")}>Front Page</button></div>}
                      <div className="home-resource-title">
                        <div>
                          <span>Reference</span>
                          <h3>Pages</h3>
                        </div>
                        <strong>{resources.pages.length}</strong>
                      </div>
                      <div className="home-resource-list compact">
                        {resources.pages.length ? (
                          resources.pages.map((page) => (
                            <ResourceRow key={page.id} onClick={() => openPage(page)}>
                              <span className="home-resource-icon">P</span>
                              <span className="home-resource-copy">
                                <strong>{page.title}</strong>
                                <small>Updated {formatResourceDate(page.updatedAt)}</small>
                              </span>
                            </ResourceRow>
                          ))
                        ) : (
                          <p className="home-resource-empty">No course pages.</p>
                        )}
                      </div>
                        </>
                      )}
                    </section>

                    <section className="home-resource-section syllabus-section" id="course-syllabus" hidden={visibleCourseSection !== "course-syllabus"}>
                      <div className="home-resource-title"><h3>Course Syllabus</h3></div>
                      <CourseSyllabus assignments={selectedCourse?.assignments || []} events={resources.syllabusEvents || []} onOpen={(kind, item) => openViewer(kind === "assignment" ? "assignment" : "page", "Syllabus", kind === "assignment" ? item : { title: item.title, body: item.description })}>
                        {resources.course?.syllabusBody && <SafeCourseHtml html={resources.course.syllabusBody} baseUrl={resources.course.homeUrl} />}
                      </CourseSyllabus>
                    </section>
                    <section
                      className="home-resource-section assignments-home-section"
                      id="course-assignments"
                      hidden={visibleCourseSection !== "course-assignments"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Course work</span>
                          <h3>Assignments</h3>
                        </div>
                        <strong>{sortedAssignments.length}</strong>
                      </div>
                      <CourseAssignments assignments={sortedAssignments} onOpen={assignment => openViewer("assignment", formatCourseDisplayName(selectedCourse.name), assignment)} />
                    </section>

                    <section
                      className="home-resource-section discussions-section"
                      id="course-discussions"
                      hidden={visibleCourseSection !== "course-discussions"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Class conversation</span>
                          <h3>Discussions</h3>
                        </div>
                        <strong>{(resources.discussions || []).length}</strong>
                      </div>
                      <CourseDiscussions discussions={resources.discussions} onOpen={discussion => openViewer("discussion", "Discussion", discussion)} />
                    </section>

                    <section
                      className="home-resource-section quizzes-section"
                      id="course-quizzes"
                      hidden={visibleCourseSection !== "course-quizzes"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Assessments</span>
                          <h3>Quizzes</h3>
                        </div>
                        <strong>{(resources.quizzes || []).length}</strong>
                      </div>
                      <CourseQuizzes quizzes={resources.quizzes} onOpen={quiz => openViewer("quiz", "Quiz", quiz)} />
                    </section>

                    <section
                      className="home-resource-section people-section"
                      id="course-people"
                      hidden={visibleCourseSection !== "course-people"}
                    >
                      <div className="home-resource-title">
                        <div>
                          <span>Course participants</span>
                          <h3>People</h3>
                        </div>
                        {resources.people != null && <strong>{resources.people.length}</strong>}
                      </div>
                      <CoursePeoplePanel key={selectedCourse.id} courseId={selectedCourse.id} active={visibleCourseSection === "course-people"} people={resources.people} onOpen={person => openViewer("person", "People", person, { sectionId: "course-people" })} />
                    </section>
                  </div>
                ) : null}
              </section>
            )}
          </>
        )}
      </section>
      <CourseContentViewer
        chrome={{
          activeView: "home",
          data,
          user,
          onNavigate: navigateHome,
          files: resources?.files || [],
          courseNavigation: {
            items: courseNavigationItems,
            onSelect: selectCourseNavigation,
          },
          courseIdentity: selectedCourse
            ? {
                name: formatCourseDisplayName(selectedCourse.name),
                instructor: selectedCourse.instructor,
              }
            : null,
          disconnect,
          signOut,
          deleteAccount,
        }}
        error={viewerError}
        loading={viewerLoading}
        viewer={viewer}
      />
    </main>
  );
}

function GradesHome({
  data,
  user,
  openCourse,
  onNavigate,
  refreshFeedback,
  disconnect,
  signOut,
  deleteAccount,
}) {
  const [activeFilter, setActiveFilter] = useHistoryState("moofieGradeFilter", null);
  const [selectedAssignment, setSelectedAssignment] = useHistoryState("moofieGradeAssignment", null, true);
  const [completedAssignments, setCompletedAssignments] = useState(() =>
    readCompletedAssignments(user?.id),
  );
  const [calendarDayVersion, setCalendarDayVersion] = useState(0);
  const termLabel = data.courses
    .map((course) => getCourseTermLabel(course.name))
    .find(Boolean);

  const previewItems = activeFilter
    ? getAssignmentList(data.courses, activeFilter).filter(
        ({ course, assignment }) =>
          activeFilter !== "missing" ||
          !completedAssignments.has(assignmentKey(course.id, assignment.id)),
      )
    : [];

  useEffect(() => {
    setCompletedAssignments(readCompletedAssignments(user?.id));
  }, [user?.id]);

  useEffect(() => {
    const nextDay = new Date();
    nextDay.setHours(24, 0, 0, 50);
    const timeoutId = window.setTimeout(
      () => setCalendarDayVersion((current) => current + 1),
      nextDay.getTime() - Date.now(),
    );
    return () => window.clearTimeout(timeoutId);
  }, [calendarDayVersion]);

  useEffect(() => {
    const assignmentKeys = new Set(
      data.courses.flatMap((course) =>
        (course.assignments || []).map((assignment) =>
          assignmentKey(course.id, assignment.id),
        ),
      ),
    );
    setCompletedAssignments((current) => {
      const next = new Set(
        [...current].filter((key) => assignmentKeys.has(key)),
      );
      if (next.size === current.size) return current;
      writeCompletedAssignments(user?.id, next);
      return next;
    });
  }, [data.courses, user?.id]);

  function toggleCompleted(courseId, assignment) {
    const key = assignmentKey(courseId, assignment.id);
    setCompletedAssignments((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      writeCompletedAssignments(user?.id, next);
      return next;
    });
  }

  function toggleFilter(nextFilter) {
    setActiveFilter((current) => (current === nextFilter ? null : nextFilter));
  }

  return (
    <main
      className={`grades-shell pull-${refreshFeedback.phase}`}
      style={{ "--page-pull": `${refreshFeedback.distance}px` }}
    >
      <RefreshFeedback feedback={refreshFeedback} />
      <SignedInNav
        activeView="grades"
        data={data}
        user={user}
        onNavigate={onNavigate}
        disconnect={disconnect}
        signOut={signOut}
        deleteAccount={deleteAccount}
      />

      <section className="grades-content">
        <div className="grades-heading">
          <div>
            <p className="eyeline">
              {data.profile.short_name || data.profile.name}
            </p>
            <h1>My grades</h1>
          </div>

          <GradeSummary
            activeFilter={activeFilter}
            completed={completedAssignments}
            courses={data.courses}
            onToggle={toggleFilter}
          />
        </div>

        <AssignmentPreview
          completed={completedAssignments}
          items={previewItems}
          type={activeFilter}
          onToggleCompleted={toggleCompleted}
          onOpenAssignment={(course, assignment) =>
            setSelectedAssignment({ course, assignment })
          }
        />

        {data.courses.length === 0 ? (
          <div className="empty-card">
            <div>
              <h2>No active courses</h2>
              <p>Your active Canvas courses will appear here when available.</p>
            </div>
          </div>
        ) : (
          <section className="courses-section">
            <div className="courses-heading">
              <div className="courses-heading-label">
                <span>Courses</span>
                {termLabel && <span>· {termLabel}</span>}
              </div>
              <span className="courses-count">{data.courses.length} courses</span>
            </div>

            <div className="grade-list">
              {data.courses.map((course) => {
                const counts = courseAssignmentCounts(course);
                const visibleUpcoming = getAssignmentList([course], "upcoming")
                  .filter(
                    ({ assignment }) =>
                      !completedAssignments.has(
                        assignmentKey(course.id, assignment.id),
                      ),
                  ).length;

                return (
                  <button
                    className="grade-card"
                    key={course.id}
                    onClick={() => openCourse(course.id)}
                    aria-label={`Open ${formatCourseDisplayName(course.name)}`}
                    title={`Open ${formatCourseDisplayName(course.name)}`}
                  >
                    <div className="course-copy">
                      <span className="course-update">
                        {formatCourseUpdatedAt(course)}
                      </span>

                      <h2>{formatCourseDisplayName(course.name)}</h2>

                      <p className="course-meta">
                        {counts.total}{" "}
                        {counts.total === 1 ? "assignment" : "assignments"}
                        {" · "}
                        {visibleUpcoming} upcoming
                      </p>
                    </div>
                    <div className="course-grade">
                      <strong
                        className={`grade-letter ${gradeTone(course.letter)}`}
                      >
                        {course.letter || "—"}
                      </strong>

                      {course.grade !== null &&
                        course.grade !== undefined &&
                        Number.isFinite(Number(course.grade)) && (
                          <span className="grade-percent">
                            ({formatPercent(Number(course.grade))})
                          </span>
                        )}
                    </div>

                    <span className="chevron" aria-hidden="true">
                      ›
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </section>
      <CourseContentViewer
        chrome={{
          activeView: "grades",
          data,
          user,
          onNavigate,
          disconnect,
          signOut,
          deleteAccount,
        }}
        error=""
        loading={false}
        viewer={
          selectedAssignment
            ? {
                type: "assignment",
                label: formatCourseDisplayName(selectedAssignment.course.name),
                item: selectedAssignment.assignment,
                courseId: selectedAssignment.course.id,
                returnView: "grades",
              }
            : null
        }
      />
    </main>
  );
}

// Public project pages are static React content wrapped in the shared site chrome.
function AboutPage() {
  const [openPreview, setOpenPreview] = useState(false);

  return (
    <main className="legal-page about-index-page">
      <PublicNav label="About page navigation" />
      <section className="writing-index">
        <header className="writing-index-header">
          <h1>About</h1>
        </header>

        <a className="writing-entry-card" href="/about/why-i-built-moofie">
          <div className="writing-entry-image">
            <img src="/pic.png" alt="Pixel-art city landscape used by Moofie" />
          </div>
          <div className="writing-entry-copy">
            <div className="writing-entry-meta">
              <time dateTime="2026-08-12">August 12, 2026</time>
            </div>
            <h2>Why I Built Moofie?</h2>
            <p>
              A rant about the ideas, frustrations, and decisions behind the
              project.
            </p>
          </div>
          <span className="writing-entry-number">Entry 01</span>
        </a>

        <section className="about-page-overview">
          <div className="about-intro">
            <h2>What is Moofie?</h2>
            <p>
              Moofie turns your CatCourses data into a focused gradebook that
              makes your grades, deadlines, missing work, and course progress
              easier to understand at a glance.
            </p>
          </div>
          <div className="about-grid about-page-features about-index-features">
            <article className="about-card">
              <h3>See what matters</h3>
              <p>
                Review current grades, upcoming work, and missing assignments
                from one dashboard.
              </p>
            </article>
            <article className="about-card">
              <h3>Plan ahead</h3>
              <p>
                Test future scores and add what-if assignments before making
                decisions about your coursework.
              </p>
            </article>
          </div>
          <div className="product-preview-grid">
            <figure className="product-preview">
              <div className="product-preview-bar" aria-hidden="true">
                <span /><span /><span />
                <small>Moofie gradebook preview</small>
              </div>
              <button
                className="product-preview-image"
                type="button"
                onClick={() => setOpenPreview(true)}
                aria-label="Enlarge Moofie gradebook preview"
              >
                <img
                  src="/moofie-dashboard-preview.png"
                  alt="Moofie dashboard preview showing four sample courses and grades"
                />
              </button>
            </figure>
          </div>
        </section>
      </section>

      {openPreview && (
        <div
          className="preview-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged Moofie preview"
          onClick={() => setOpenPreview(false)}
        >
          <img
            src="/moofie-dashboard-preview.png"
            alt="Enlarged Moofie dashboard preview"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </main>
  );
}

function AboutEntryPage() {
  return (
    <main className="legal-page about-page">
      <PublicNav label="About page navigation" />

      <section className="about-story">
        <article className="journal-entry">
          <time className="journal-date" dateTime="2026-08-12">August 12, 2026</time>
          <h1>Why I Built Moofie?</h1>
          <p><strong>I feel like most of my time has gone into calculating my grades than actually earning them.</strong></p>
          <p>I had a certain routine I created in my first year at the university. Open up CatCourses. Click on a course. Scroll through the gradebook. Forget what I was looking for. Scroll back up. Locate the assignment I am looking for. Open a different course. Repeat the whole process all over again.</p>
          <p>Finding one specific assignment in the gradebook felt like digging through a junk yard and hoping I recognized what I came for.</p>
          <p>At some point, I would remember about the calendar.</p>
          <p>Then I'd open that too.</p>

          <p>CatCourses was never particularly bad at any of these things. <strong>The only problem was that the information I cared about existed everywhere except where I wanted it.</strong> My grades lived in one place, upcoming assignments in another, missing work somewhere in a list I'd inevitably scroll past, and the syllabus held the secret formula explaining what any of those numbers actually meant.</p>
          <p>Most of the time it was irritating. During the finals week it turned into a scientific experiment.</p>

          <p>I'd search "grade calculator" on Google, select the first page I believed to be trustworthy, and keep it open next to the syllabus for the course I was taking. Exams: 40%. Homework: 20%. Projects: 25%. Final: 15%. Then I'd go back to CatCourses, and look for my scores in each of those categories, transfer those numbers over, and finally add a hypothetical final exam score.</p>
          <div className="journal-questions">
            <p>What do I need for an A?</p>
            <p>Change it to another number.</p>
            <p>What if I got an 87?</p>
            <p>Change it again.</p>
            <p>How about getting an 82?</p>
          </div>
          <p>Then I would realize that I was taking more than one class and would have to repeat the process several times more.</p>
          <p>There was something profoundly absurd about spending twenty minutes calculating how much one needed to earn in class when I could be studying during this period. Nevertheless, I repeated this process because for me, knowing where I stand makes everything else easier.</p>
          <p>It gives me an idea on how my grade looks like before I input another assignment or exam. It gives me an idea on how much I have to score on a future assignment to keep my grade or to achieve another.</p>
          <p><strong>I didn't want more information but wanted the information I already had to make sense.</strong></p>

          <p>I started asking friends how they kept track of everything. Their systems weren't much better. Some bounced between CatCourses and the calendar. Some checked individual classes every day. Some used Coursicle to catch assignments they'd missed elsewhere. Others had spreadsheets, calculators, or some combination of all of them.</p>
          <p>Apparently we'd all independently invented different solutions to the same inconvenience. My friends started recognizing the same problems, and the project stopped feeling quite as personal. I tried out various extensions as well.</p>
          <p>Some came very close but they still weren't good enough and didn't solve the problems we had. One made grades nicer to see but didn't have the ability to add assignments. Another would have a nice dashboard for assignments, but made the grades dashboard horrendous. I still ended up switching between my tabs, syllabi, and calculators.</p>
          <p><strong>At some point, maintaining my system for keeping track of school started feeling like another class.</strong></p>

          <p>I've always had a habit of noticing little problems like this. A button that should take only one click but needs three. Information that is available but hard to find. A recurring process that everyone has accepted as normal. After I see something similar, I start wondering what I could do differently and whether I could fix it with code.</p>
          <p><strong>So I opened VS Code.</strong></p>
          <p>I wanted to create a page that would allow me to open my laptop and answer several embarrassing simple questions instantly:</p>
          <div className="journal-questions">
            <p>What grade do I gave?</p>
            <p>What else do I have to do?</p>
            <p>What have I already done?</p>
            <p>What will happen if I get 73 for the final exam?</p>
          </div>
          <p>These questions became the foundation of everything else.</p>

          <p>Courses didn't need to hide behind separate pages. Assignments didn't need to become a scavenger hunt. Upcoming and missing work should look obviously different. A what-if grade shouldn't require reconstructing an entire syllabus inside some calculator every time curiosity gets the better of me.</p>
          <p>CatCourses has to be everything. It has to handle announcements, modules, discussions, files, instructor tools, submissions, and a hundred other things that make a learning management system function.</p>
          <p>Moofie doesn't have that responsibility. It can be selfish. It can care disproportionately about the few things I open CatCourses for every day: what I have, what I owe, and where I'm headed.</p>
          <p>That's the distinction I've come to like most.</p>
          <p>CatCourses is the default.</p>
          <p><strong>Moofie is the custom skin.</strong></p>
          <p>The process of making this web app took me several weeks. It took a lot of learning, tutorials, understanding, and debugging to create Moofie. However, even if it ends up being useless, at least I can be proud of myself for taking a shot and trying to fix an issue that is not just mine alone but also belonged to many other people.</p>

          <p>I still open CatCourses, but I want that to become less necessary. Announcements, modules, files, and course pages belong beside the grades and deadlines I already check in Moofie.</p>
          <p>The goal is for Moofie to become the place I start, with Canvas only opening when a course tool truly requires it.</p>
          <p>I suppose that problems like these help me expand my creativity through building.</p>
          <p>Not the kind born from sitting down and asking what should I build?</p>

          <p>The kind that starts when something ordinary bothers you just enough that you start becoming aware and noticing it. You notice the extra clicks. You observe the repeated searches. You become aware of the small inconveniences that nobody seems to think about that has become normal.</p>
          <p>Instead of placing that in the list of usual things, you start to use your editor.</p>
          <p><strong>Sometimes, people don’t realize certain problems they face until someone points them out.</strong></p>
          <a className="journal-try-link" href="/">Try Moofie</a>
        </article>
      </section>
    </main>
  );
}

function LegalPage({ type }) {
  const privacy = type === "privacy";

  return (
    <main className="legal-page">
      <PublicNav label={`${privacy ? "Privacy" : "Terms"} page navigation`} />

      <article className="legal-content">
        <p className="legal-kicker">Last updated August 13, 2026</p>
        <h1>{privacy ? "Privacy Policy" : "Terms of Service"}</h1>

        {privacy ? (
          <>
            <p>
              Moofie is a student-built tool for UC Merced students. It is not
              an official UC Merced or Instructure service.
            </p>

            <h2>Information Moofie uses</h2>
            <p>
              Moofie uses your name, email, Google account ID, and profile
              information to sign you in. If you connect Canvas, it also uses
              your CatCourses URL, encrypted Canvas token, and the course,
              assignment, submission, due-date, score, grade, announcement,
              module, page, and file metadata needed to show your courses.
              Course files are linked from Canvas rather than copied into
              Moofie. Basic request and error details may be processed for
              security and reliability.
            </p>

            <h2>How it is used</h2>
            <p>
              This information is used only to provide, secure, and improve
              Moofie. Moofie does not sell your information, use it for ads, or
              use Google or Canvas data to train AI models. What-if changes are
              temporary and are never saved to Canvas.
            </p>

            <h2>Storage</h2>
            <p>
              Supabase stores your account and encrypted Canvas connection.
              Recent gradebook data may remain in your browser for up to 15
              minutes and is cleared when you sign out. Your Google password is
              never shared with or stored by Moofie.
            </p>

            <h2>Sharing</h2>
            <p>
              Moofie shares information only with Supabase, Google, and Canvas
              as needed to run the service, or when required for security or by
              law. Its use of information from Google APIs follows the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                rel="noreferrer"
                target="_blank"
              >
                Google API Services User Data Policy
              </a>
              , including its Limited Use requirements.
            </p>

            <h2>Your choices and deletion</h2>
            <p>
              You can disconnect Canvas, delete your account, revoke Google
              access, or clear browser storage at any time. Disconnecting Canvas permanently deletes the connection from the active database. Deleting your account permanently deletes your account and Canvas connection from the active database.
            </p>
            <p>
              Deleted information may remain temporarily in backups or security
              logs until removed under the applicable retention schedules.
            </p>

            <h2>Age</h2>
            <p>
              Moofie is for college students and is not directed to children
              under 13. Do not share your account or Canvas token.
            </p>

            <h2>Contact</h2>
            <p>
              For questions, privacy requests, or deletion requests, email{" "}
              <a href="mailto:moofieapp@gmail.com">moofieapp@gmail.com</a>.
            </p>
          </>
        ) : (
          <>
            <p>By using Moofie, you agree to these terms.</p>

            <h2>Using Moofie</h2>
            <p>
              Moofie is an unofficial student-built gradebook and what-if tool.
              Connect only accounts and records you are allowed to access. Keep
              your account and Canvas token private, and follow applicable laws
              and university rules.
            </p>

            <h2>Acceptable use</h2>
            <p>
              Do not misuse, scrape, reverse engineer, disrupt, overload, or
              attempt unauthorized access to Moofie or another person&apos;s data.
            </p>

            <h2>Grades</h2>
            <p>
              Moofie is not an official academic record. Grades and what-if
              results may be delayed, incomplete, or calculated differently.
              Check Canvas, your syllabus, and your instructor before making
              academic decisions.
            </p>

            <h2>Service</h2>
            <p>
              Moofie depends on Google, Supabase, UC Merced, and Instructure.
              It may change, stop working, or become unavailable. Moofie is
              provided &quot;as is&quot; without guarantees. To the extent allowed by
              law, Moofie and its developer are not responsible for academic
              decisions, lost data, interruptions, or reliance on its results.
            </p>

            <h2>Your account</h2>
            <p>
              You may disconnect Canvas or delete your account at any time.
              Moofie may restrict accounts that misuse the service.
            </p>

            <h2>Contact</h2>
            <p>
              These terms may change as Moofie changes. For questions, email{" "}
              <a href="mailto:moofieapp@gmail.com">moofieapp@gmail.com</a>.
            </p>
          </>
        )}

      </article>
    </main>
  );
}

// Course detail screen: render Canvas assignments and calculate temporary what-if grades.
function CourseDetails({
  course,
  data,
  user,
  onNavigate,
  refreshFeedback,
  disconnect,
  signOut,
  deleteAccount,
}) {
  const initialValues = useMemo(
    () =>
      Object.fromEntries(
        course.groups
          .flatMap((group) => group.assignments)
          .map((assignment) => [assignment.id, assignment.earned ?? ""]),
      ),
    [course],
  );

  const [values, setValues] = useState(initialValues);
  const [manualAssignments, setManualAssignments] = useState({});
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [addingGroupId, setAddingGroupId] = useState(null);
  const [newAssignment, setNewAssignment] = useState({
    title: "",
    points: "",
  });
  const [selectedAssignment, setSelectedAssignment] = useHistoryState("moofieCourseAssignment", null, true);
  useEffect(() => {
    setValues(initialValues);
    setManualAssignments({});
    setAddingGroupId(null);
  }, [initialValues]);

  const groups = useMemo(
    () =>
      course.groups.map((group) => ({
        ...group,
        assignments: [
          ...group.assignments,
          ...(manualAssignments[group.id] || []),
        ],
      })),
    [course.groups, manualAssignments],
  );

  const projected = calculateCourseGrade({ ...course, groups }, values);
  const groupSummaries = groups.map((group) => {
    const assignments = group.assignments.filter(
      (assignment) => !assignment.omitted,
    );

    return {
      group,
      assignments,
      grade: calculateGroupGrade(assignments, values, group.rules),
      totals: groupPointTotals(assignments, values, group.rules),
    };
  });
  const coursePointTotals = groupSummaries.reduce(
    (total, summary) => ({
      earned: total.earned + summary.totals.earned,
      possible: total.possible + summary.totals.possible,
    }),
    { earned: 0, possible: 0 },
  );
  const hasManualAssignments = Object.values(manualAssignments).some(
    (assignments) => assignments.length > 0,
  );
  const hasEditedScores = Object.entries(initialValues).some(
    ([assignmentId, initialValue]) =>
      String(values[assignmentId] ?? "") !== String(initialValue ?? ""),
  );
  const hasWhatIfChanges = hasManualAssignments || hasEditedScores;

  function startAdding(groupId) {
    setAddingGroupId(groupId);
    setNewAssignment({ title: "", points: "" });
  }

  function addAssignment(event, groupId) {
    event.preventDefault();

    const title = newAssignment.title.trim();
    const points = Number(newAssignment.points);

    if (!title || !Number.isFinite(points) || points <= 0) return;

    const id = `manual-${groupId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const assignment = {
      id,
      title,
      points,
      earned: null,
      dueAt: null,
      htmlUrl: null,
      omitted: false,
      excused: false,
      manual: true,
    };

    setManualAssignments((current) => ({
      ...current,
      [groupId]: [...(current[groupId] || []), assignment],
    }));

    setValues((current) => ({ ...current, [id]: "" }));
    setAddingGroupId(null);
    setNewAssignment({ title: "", points: "" });
  }

  function resetWhatIf() {
    setValues(initialValues);
    setManualAssignments({});
    setAddingGroupId(null);
    setNewAssignment({ title: "", points: "" });
  }

  function removeAssignment(groupId, assignmentId) {
    setManualAssignments((current) => ({
      ...current,
      [groupId]: (current[groupId] || []).filter(
        (assignment) => assignment.id !== assignmentId,
      ),
    }));

    setValues((current) => {
      const next = { ...current };
      delete next[assignmentId];
      return next;
    });
  }

  function toggleGroup(groupId) {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  return (
    <main
      className={`grades-shell pull-${refreshFeedback.phase}`}
      style={{ "--page-pull": `${refreshFeedback.distance}px` }}
    >
      <RefreshFeedback feedback={refreshFeedback} />
      <SignedInNav
        activeView="grades"
        data={data}
        user={user}
        onNavigate={onNavigate}
        disconnect={disconnect}
        signOut={signOut}
        deleteAccount={deleteAccount}
      />

      <section className="details-content">
        <header className="course-header">
          <div>
            {getCourseTermLabel(course.name) && (
              <p>{getCourseTermLabel(course.name)}</p>
            )}
            <h1>{formatCourseDisplayName(course.name)}</h1>
          </div>

          <div className="large-grade">
            <strong>
              {projected === null
                ? "—"
                : (
                    <>
                      <span>{gradeLetterForPercent(projected)}</span>
                      <span>{formatPercent(projected)}</span>
                    </>
                  )}
            </strong>
            <span className="projected-label">Projected grade</span>
          </div>
        </header>

        <section className="assignments-section">
          <div className="section-title">
            <div>
              <h2>Grades</h2>
              <p>
                Edit a score or add a future assignment to test your grade.
              </p>
            </div>

            <button onClick={resetWhatIf}>Reset what-if grades</button>
          </div>

          {hasWhatIfChanges && (
            <div className="what-if-notice">
              <span>What-if changes are active.</span>
            </div>
          )}

          <section className="grade-overview" aria-labelledby="grade-summary-title">
            <h3 id="grade-summary-title">Grade summary</h3>
            <div className="grade-overview-table">
              <div className="grade-overview-row headings" aria-hidden="true">
                <span>Category</span>
                <span>Grade</span>
                <span>Total points</span>
              </div>
              {groupSummaries.map(({ group, grade, totals }) => (
                <div className="grade-overview-row" key={group.id}>
                  <strong>{group.name}</strong>
                  <span>
                    {grade.percent === null
                      ? "—"
                      : `${gradeLetterForPercent(grade.percent)}  ${formatPercent(grade.percent)}`}
                  </span>
                  <span>
                    {formatPoints(totals.earned)} /{" "}
                    {formatPoints(totals.possible)} pts
                  </span>
                </div>
              ))}

              <div className="grade-overview-row overall">
                <strong>Overall</strong>
                <span>
                  {projected === null
                    ? "—"
                    : `${gradeLetterForPercent(projected)}  ${formatPercent(projected)}`}
                </span>
                <span>
                  {formatPoints(coursePointTotals.earned)} /{" "}
                  {formatPoints(coursePointTotals.possible)} pts
                </span>
              </div>
            </div>
          </section>

          <h3 className="assignment-groups-title">Assignment groups</h3>
          <div className="assignment-groups-grid">
          {groupSummaries.map(({ group, assignments, totals, grade: groupGrade }) => {
            const isCollapsed = Boolean(collapsedGroups[group.id]);

            return (
              <div className="assignment-group" key={group.id}>
                <div className="group-label">
                  <div>
                    <h3>{group.name}</h3>
                    {course.weighted && (
                      <span>{group.weight}% of grade</span>
                    )}
                    {(group.rules?.dropLowest > 0 ||
                      group.rules?.dropHighest > 0) && (
                      <span>
                        {group.rules.dropLowest > 0 &&
                          `Drops ${group.rules.dropLowest} lowest`}
                        {group.rules.dropLowest > 0 &&
                          group.rules.dropHighest > 0 &&
                          " · "}
                        {group.rules.dropHighest > 0 &&
                          `Drops ${group.rules.dropHighest} highest`}
                      </span>
                    )}
                  </div>
                  <button
                    className="collapse-group"
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!isCollapsed}
                    aria-controls={`group-${group.id}`}
                  >
                    {isCollapsed ? "Show" : "Hide"}
                  </button>
                </div>

                {!isCollapsed && (
                  <div id={`group-${group.id}`}>
                <div className="assignment-table">
                  {assignments.length === 0 ? (
                    <p className="no-assignments">
                      No assignments in this group yet.
                    </p>
                  ) : (
                    assignments.map((assignment) => (
                      <div className="assignment-row" key={assignment.id}>
                        <div>
                          <button
                            className="assignment-name assignment-name-button"
                            type="button"
                            onClick={() => setSelectedAssignment(assignment)}
                          >
                            {assignment.title}
                          </button>

                          <span className="assignment-details">
                            <span>
                              {assignment.manual
                                ? "What-if assignment"
                                : formatDueDate(assignment.dueAt)}
                            </span>

                            {assignment.missing ? (
                              <span className="status-pill missing">Missing</span>
                            ) : assignment.late ? (
                              <span className="status-pill late">Late</span>
                            ) : assignment.submitted ? (
                              <span className="status-pill submitted">
                                Submitted
                              </span>
                            ) : null}

                            {!assignment.manual &&
                              String(values[assignment.id] ?? "") !==
                                String(initialValues[assignment.id] ?? "") && (
                                <span className="edited-pill">Edited</span>
                              )}
                          </span>
                        </div>

                        <div className="score-input">
                          <input
                            type="number"
                            min="0"
                            max={assignment.points}
                            value={values[assignment.id]}
                            placeholder="—"
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [assignment.id]: event.target.value,
                              }))
                            }
                          />

                          <span>
                            / {formatPoints(Number(assignment.points) || 0)}
                          </span>

                          {assignment.manual && (
                            <button
                              className="remove-assignment"
                              type="button"
                              onClick={() =>
                                removeAssignment(group.id, assignment.id)
                              }
                              aria-label={`Remove ${assignment.title}`}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="group-total-row">
                  <strong>Total</strong>
                  <span className="group-grade">
                    {groupGrade.percent === null
                      ? "—"
                      : `${gradeLetterForPercent(groupGrade.percent)} ${formatPercent(groupGrade.percent)}`}
                  </span>
                  <span className="group-points">
                    {formatPoints(totals.earned)} /{" "}
                    {formatPoints(totals.possible)} pts
                  </span>
                </div>

                {addingGroupId === group.id ? (
                  <form
                    className="add-assignment-form"
                    onSubmit={(event) => addAssignment(event, group.id)}
                  >
                    <input
                      type="text"
                      value={newAssignment.title}
                      onChange={(event) =>
                        setNewAssignment((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      placeholder="Assignment name"
                      required
                    />

                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={newAssignment.points}
                      onChange={(event) =>
                        setNewAssignment((current) => ({
                          ...current,
                          points: event.target.value,
                        }))
                      }
                      placeholder="Total pts"
                      required
                    />

                    <button type="submit">Add assignment</button>

                    <button
                      className="cancel-add"
                      type="button"
                      onClick={() => setAddingGroupId(null)}
                    >
                      Cancel
                    </button>

                    <small>
                      This only affects your Moofie what-if grade.
                    </small>
                  </form>
                ) : (
                  <button
                    className="add-assignment-button"
                    type="button"
                    onClick={() => startAdding(group.id)}
                  >
                    + Add assignment
                  </button>
                )}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </section>
      </section>
      <CourseContentViewer
        chrome={{
          activeView: "grades",
          data,
          user,
          onNavigate,
          disconnect,
          signOut,
          deleteAccount,
        }}
        viewer={
          selectedAssignment
            ? {
                type: "assignment",
                label: formatCourseDisplayName(course.name),
                item: selectedAssignment,
                courseId: course.id,
                returnView: "grades",
                returnCourseId: course.id,
              }
            : null
        }
      />
    </main>
  );
}

// Shared loading and confirmation overlays.
function AppLoading() {
  return (
    <main className="grades-shell app-loading" aria-label="Loading gradebook">
      <header className="topbar">
        <div className="skeleton skeleton-wordmark" />
        <div className="skeleton skeleton-action" />
      </header>

      <section className="grades-content">
        <div className="skeleton-heading-row" aria-hidden="true">
          <div>
            <div className="skeleton skeleton-eyeline" />
            <div className="skeleton skeleton-title" />
          </div>
          <div className="skeleton-summary-list">
            <div className="skeleton skeleton-summary" />
            <div className="skeleton skeleton-summary" />
          </div>
        </div>

        <div className="skeleton skeleton-section-label" aria-hidden="true" />

        <div className="skeleton-card-list" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <div className="skeleton-card" key={item}>
              <div>
                <div className="skeleton skeleton-line-short" />
                <div className="skeleton skeleton-line-wide" />
                <div className="skeleton skeleton-line-medium" />
              </div>
              <div className="skeleton skeleton-grade" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function AccountActionDialog({ action, busy, error, onCancel, onConfirm }) {
  if (!action) return null;

  const content = {
    disconnect: {
      eyebrow: "Canvas connection",
      title: "Disconnect Canvas?",
      description:
        "Your saved Canvas connection and token will be removed. You can reconnect later to view your gradebook again.",
      confirm: "Disconnect Canvas",
    },
    signout: {
      eyebrow: "Moofie account",
      title: "Sign out?",
      description:
        "You’ll be signed out of Moofie on this device. Your Canvas connection will stay saved to your account.",
      confirm: "Sign out",
    },
    delete: {
      eyebrow: "Permanent action",
      title: "Delete your account?",
      description:
        "This permanently deletes your Moofie account, Canvas connection, and stored token. This cannot be undone.",
      confirm: "Delete account",
    },
  }[action];

  return (
    <div
      className="action-dialog-backdrop"
      role="presentation"
      onMouseDown={busy ? undefined : onCancel}
    >
      <section
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <p className="action-dialog-eyebrow">{content.eyebrow}</p>
        <h2 id="action-dialog-title">{content.title}</h2>
        <p>{content.description}</p>
        {error && <div className="action-dialog-error">{error}</div>}
        <div className="action-dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="action-dialog-confirm"
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Working…" : content.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

// Authenticated application controller: restore sessions, load data, and choose a screen.
function GradebookApp() {
  const [resourcesByCourse, setResourcesByCourse] = useState({});
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useHistoryState("moofieCourse", null);
  const [activeView, setActiveView] = useHistoryState("moofieView", "home");
  useNavigationScroll();
  const [accountAction, setAccountAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [refreshFeedback, setRefreshFeedback] = useState({
    phase: "idle",
    distance: 0,
  });
  const refreshRequestRef = useRef(null);
  const refreshFeedbackActiveRef = useRef(false);
  const refreshFeedbackTimeoutRef = useRef(null);
  const pullStartRef = useRef(null);
  const pullDistanceRef = useRef(0);

  // Audit the enrolled course catalog even when a user never opens those tabs.
  const coverageCourses = JSON.stringify((data?.courses || []).map(({ id, name }) => ({ id, name })));
  useEffect(() => {
    if (!session?.user?.id) return;
    return startCourseCoverage({
      courses: JSON.parse(coverageCourses),
      readResources: id => loadCourseResources(id, { refresh: true }),
      readPage: (id, url) => loadCoursePage(id, url, { refresh: true }),
      onResources: (id, next) => setResourcesByCourse(previous => ({ ...previous, [id]: mergeCourseResources(previous[id], next) })),
      report: updateCanvasCoverage,
    });
  }, [session?.user?.id, coverageCourses]);

  function openCourse(courseId) {
    writeNavigation({ ...closedContent, moofieView: "grades", moofieCourse: courseId });
  }

  function navigate(nextView) {
    const current = readNavigation();
    if (current.moofieView === nextView && !current.moofieCourse &&
        !(nextView === "home" && current.moofieHomeCourse) &&
        !current.moofieViewer && !current.moofieGradeAssignment && !current.moofieCourseAssignment) return;
    writeNavigation({
      ...closedContent,
      moofieView: nextView,
      moofieCourse: null,
      ...(nextView === "home" ? { moofieHomeCourse: null, moofieHomeSection: "course-overview" } : {}),
    });
  }

  const refreshDashboard = useCallback(async (showFeedback = false) => {
    const userId = session?.user?.id;
    if (!userId) return false;

    if (showFeedback) {
      clearCanvasReadCache();
      window.clearTimeout(refreshFeedbackTimeoutRef.current);
      refreshFeedbackActiveRef.current = true;
      setRefreshFeedback({ phase: "refreshing", distance: 88 });
    }

    if (!refreshRequestRef.current) {
      const operation = (async () => {
        try {
          const dashboard = await loadCanvasDashboard();
          const nextData = sanitizeDashboard(
            dashboard?.connected === false ? null : dashboard,
          );
          setData(nextData);
          setDashboardError("");
          writeDashboardCache(userId, nextData);
          return true;
        } catch (error) {
          setDashboardError(error.message || "Canvas could not be reached. Moofie will retry automatically.");
          return false;
        } finally {
          refreshRequestRef.current = null;
        }
      })();
      refreshRequestRef.current = operation;
    }

    const success = await refreshRequestRef.current;
    pullDistanceRef.current = 0;

    if (showFeedback) {
      setRefreshFeedback({
        phase: success ? "done" : "error",
        distance: 88,
      });
      refreshFeedbackTimeoutRef.current = window.setTimeout(() => {
        refreshFeedbackActiveRef.current = false;
        setRefreshFeedback({ phase: "idle", distance: 0 });
      }, 700);
    }

    return success;
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    const stop = startCanvasAutoRefresh(() => refreshDashboard());
    const manual = () => refreshDashboard(true);
    window.addEventListener("moofie:refresh", manual);
    return () => { stop(); window.removeEventListener("moofie:refresh", manual); };
  }, [session?.user?.id, refreshDashboard]);

  useEffect(
    () => () => window.clearTimeout(refreshFeedbackTimeoutRef.current),
    [],
  );

  useEffect(() => {
    if (!session || !data) return;

    function atTop() {
      return window.scrollY <= 0 && document.documentElement.scrollTop <= 0;
    }

    function startPull(event) {
      if (
        event.touches.length !== 1 ||
        !atTop() ||
        refreshFeedbackActiveRef.current
      ) return;
      refreshFeedbackActiveRef.current = true;
      pullStartRef.current = event.touches[0].clientY;
    }

    function movePull(event) {
      if (pullStartRef.current === null || event.touches.length !== 1) return;
      const movement = event.touches[0].clientY - pullStartRef.current;
      if (movement <= 0) {
        pullDistanceRef.current = 0;
        refreshFeedbackActiveRef.current = false;
        setRefreshFeedback({ phase: "idle", distance: 0 });
        return;
      }
      if (!atTop()) return;
      event.preventDefault();
      const distance = Math.min(movement * 0.45, 120);
      pullDistanceRef.current = distance;
      setRefreshFeedback({
        phase: distance >= 64 ? "ready" : "pulling",
        distance,
      });
    }

    function finishPull() {
      const shouldRefresh = pullDistanceRef.current >= 64;
      pullStartRef.current = null;
      if (shouldRefresh) refreshDashboard(true);
      else {
        pullDistanceRef.current = 0;
        refreshFeedbackActiveRef.current = false;
        setRefreshFeedback({ phase: "idle", distance: 0 });
      }
    }

    window.addEventListener("touchstart", startPull, { passive: true });
    window.addEventListener("touchmove", movePull, { passive: false });
    window.addEventListener("touchend", finishPull, { passive: true });
    window.addEventListener("touchcancel", finishPull, { passive: true });
    return () => {
      window.removeEventListener("touchstart", startPull);
      window.removeEventListener("touchmove", movePull);
      window.removeEventListener("touchend", finishPull);
      window.removeEventListener("touchcancel", finishPull);
    };
  }, [data, refreshDashboard, session]);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data: authData }) => {
        const nextSession = authData.session;
        const cache = nextSession
          ? readDashboardCache(nextSession.user.id)
          : { found: false, data: null };

        setSession(nextSession);
        setData(cache.data);
        setRestoring(Boolean(nextSession && !cache.found));
      })
      .finally(() => setAuthReady(true));

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);

        if (nextSession) {
          const cache = readDashboardCache(nextSession.user.id);
          if (cache.found) {
            setData(cache.data);
            setRestoring(false);
          } else {
            setRestoring(true);
          }
        } else {
          clearDashboardCache();
          setResourcesByCourse({});
          setData(null);
          setSelectedCourseId(null);
          setActiveView("home");
          setRestoring(false);
        }

        setAuthReady(true);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;

    const cache = readDashboardCache(session.user.id);
    if (cache.found) setData(cache.data);
    else setRestoring(true);

    refreshDashboard()
      .then((success) => {
        if (!success && !cache.found) setData(null);
      })
      .finally(() => setRestoring(false));
  }, [refreshDashboard, session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id && data) {
      writeDashboardCache(session.user.id, data);
    }
  }, [data, session?.user?.id]);

  function disconnect() {
    setActionError("");
    setAccountAction("disconnect");
  }

  function signOut() {
    setActionError("");
    setAccountAction("signout");
  }

  function deleteAccount() {
    setActionError("");
    setAccountAction("delete");
  }

  async function confirmAccountAction() {
    setActionBusy(true);
    setActionError("");
    try {
      if (accountAction === "disconnect") {
        await disconnectCanvasAccount();
        setResourcesByCourse({});
        writeDashboardCache(session.user.id, null);
        setData(null);
        setSelectedCourseId(null);
        setActiveView("home");
      } else if (accountAction === "signout") {
        clearDashboardCache();
        await supabase?.auth.signOut();
      } else if (accountAction === "delete") {
        await deleteMoofieAccount();
        clearDashboardCache();
        setData(null);
        setSelectedCourseId(null);
        setActiveView("home");
        await supabase?.auth.signOut({ scope: "local" });
      }
      setAccountAction(null);
    } catch (requestError) {
      setActionError(
        requestError.message || "Moofie could not complete this action.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  function withAccountDialog(content) {
    return (
      <>
        {content}
        <AccountActionDialog
          action={accountAction}
          busy={actionBusy}
          error={actionError}
          onCancel={() => setAccountAction(null)}
          onConfirm={confirmAccountAction}
        />
      </>
    );
  }

  if (!authReady || (restoring && !data)) return <AppLoading />;
  if (!session) return <AuthScreen />;
  if (!data && dashboardError) return <main className="document-reader-message" role="alert"><h1>Canvas could not load yet</h1><p>{dashboardError}</p><p>Your connection has not been removed. Moofie will retry automatically.</p><button type="button" onClick={() => refreshDashboard()}>Check Canvas now</button></main>;

  if (!data) {
    return withAccountDialog(
      <ConnectScreen
        onConnect={(dashboard) => {
          setData(sanitizeDashboard(dashboard));
          setActiveView("home");
        }}
        onSignOut={signOut}
        onDeleteAccount={deleteAccount}
      />,
    );
  }

  const selectedCourse = data.courses.find(
    (course) => course.id === selectedCourseId,
  );
  const accountHandlers = { disconnect, signOut, deleteAccount };

  if (activeView === "home") {
    return withAccountDialog(
      <HomeDashboard
        resourcesByCourse={resourcesByCourse}
        setResourcesByCourse={setResourcesByCourse}
        data={data}
        user={session.user}
        refreshFeedback={refreshFeedback}
        onNavigate={navigate}
        {...accountHandlers}
      />,
    );
  }

  if (selectedCourse) {
    return withAccountDialog(
      <CourseDetails
        course={selectedCourse}
        data={data}
        user={session.user}
        refreshFeedback={refreshFeedback}
        onNavigate={navigate}
        {...accountHandlers}
      />
    );
  }

  return withAccountDialog(
    <GradesHome
      data={data}
      user={session.user}
      refreshFeedback={refreshFeedback}
      openCourse={openCourse}
      onNavigate={navigate}
      {...accountHandlers}
    />,
  );
}

// Resolve the small set of public routes without adding a router dependency.
function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  let page;

  if (path === "/privacy") page = <LegalPage type="privacy" />;
  else if (path === "/terms") page = <LegalPage type="terms" />;
  else if (path === "/about") page = <AboutPage />;
  else if (path === "/about/why-i-built-moofie") page = <AboutEntryPage />;
  else page = <GradebookApp />;

  return (
    <div className="app-frame">
      {page}
      <SiteFooter />
    </div>
  );
}

export default App;
