import { useEffect, useMemo, useState } from "react";
import {
  connectCanvasAccount,
  deleteMoofieAccount,
  disconnectCanvasAccount,
  loadCanvasDashboard,
} from "./canvasApi";
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
            your gradebook on multiple devices.
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
function GradeSummary({ courses, activeFilter, onToggle }) {
  const upcoming = getAssignmentList(courses, "upcoming");
  const missing = getAssignmentList(courses, "missing");

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
    </div>
  );
}

function AssignmentPreview({ type, items }) {
  if (!type) return null;

  const title =
    type === "upcoming" ? "Upcoming assignments" : "Missing assignments";

  return (
    <section className="assignment-preview" aria-label={title}>
      <div className="assignment-preview-heading">
        <h2>{title}</h2>
      </div>

      {items.length === 0 ? (
        <div className="assignment-preview-empty">
          <div>
            <strong>
              {type === "upcoming" ? "Your schedule is clear" : "All caught up"}
            </strong>
            <p>
              {type === "upcoming"
                ? "You have no upcoming assignments right now."
                : "You have no missing assignments. Nice work."}
            </p>
          </div>
        </div>
      ) : (
        <div className="assignment-preview-list">
          {items.map(({ course, assignment }) => {
            const content = (
              <>
                <span>{course.name}</span>
                <strong>{assignment.title}</strong>
                <small>
                  {type === "upcoming"
                    ? `Due ${formatDueDate(assignment.dueAt)}`
                    : "Marked missing"}
                </small>
              </>
            );

            return assignment.htmlUrl ? (
              <a
                className="assignment-preview-item"
                href={assignment.htmlUrl}
                key={`${course.id}-${assignment.id}`}
                rel="noreferrer"
                target="_blank"
              >
                {content}
                <b aria-hidden="true">↗</b>
              </a>
            ) : (
              <div
                className="assignment-preview-item"
                key={`${course.id}-${assignment.id}`}
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GradesHome({
  data,
  user,
  openCourse,
  disconnect,
  signOut,
  deleteAccount,
}) {
  const [activeFilter, setActiveFilter] = useState(null);

  const previewItems = activeFilter
    ? getAssignmentList(data.courses, activeFilter)
    : [];

  function toggleFilter(nextFilter) {
    setActiveFilter((current) => (current === nextFilter ? null : nextFilter));
  }

  return (
    <main className="grades-shell">
      <SignedInNav
        data={data}
        user={user}
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
            courses={data.courses}
            onToggle={toggleFilter}
          />
        </div>

        <AssignmentPreview items={previewItems} type={activeFilter} />

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
              <span>Courses</span>
              <span>{data.courses.length} courses</span>
            </div>

            <div className="grade-list">
              {data.courses.map((course) => {
                const counts = courseAssignmentCounts(course);

                return (
                  <button
                    className="grade-card"
                    key={course.id}
                    onClick={() => openCourse(course.id)}
                    aria-label={`Open ${course.name}`}
                    title={`Open ${course.name}`}
                  >
                    <div className="course-copy">
                      <span className="course-update">
                        {formatCourseUpdatedAt(course)}
                      </span>

                      <h2>{course.name}</h2>

                      <p className="course-meta">
                        {counts.total}{" "}
                        {counts.total === 1 ? "assignment" : "assignments"}
                        {" · "}
                        {counts.upcoming} upcoming
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
          <p>I had a certain routine I created in my first year at the university. Open up CatCourses. Click on a course. Scroll through the gradebook. Scroll through the gradebook. Forget what I was looking for. Scroll back up. Locate the assignment I am looking for. Open a different course. Repeat the whole process all over again.</p>
          <p>Finding one specific assignment in the gradebook felt like digging through a junk yard and hoping I recognized what I came for.</p>
          <p>At some point, I would remember about the calendar.</p>
          <p>Then I'd open that too.</p>

          <p>CatCourses was never particularly bad at any of these things. <strong>The only problem was that the information I cared about existed everywhere except where I wanted it.</strong> My grades lived in one place, upcoming assignments in another, missing work somewhere in a list I'd inevitably scroll past, and the syllabus held the secret formula explaining what any of those numbers actually meant.</p>
          <p>Most of the time it was irritating. During the finals week it turned into a scientific experiment.</p>

          <p> I'd search "grade calculator" on Google, select the first page I believed to be trustworthy, and keep it open next to the syllabus for the course I was taking. Exams: 40%. Homework: 20%. Projects: 25%. Final: 15%. Then I'd go back to CatCourses, and look for my scores in each of those categories, transfer those numbers over, and finally add a hypothetical final exam score.</p>
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
          <p>Apparently we'd all independently invented different solutions to the same inconvenience. My friends started recognizing the same problems, and the project stopped feeling quite as personal.I tried out various extensions as well.</p>
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

          <p>I still open CatCourses. There are announcements I need to read, course materials I need to view, and pieces of a course that Moofie intentionally doesn't reproduce. I'm not interested in pretending those things don't matter simply because I didn't build them.</p>
          <p>When I want to know how I'm doing, I open Moofie. When I want to know miscellaneous information like teacher announcements, I open Canvas like a topping.</p>
          <p>I suppose that problems like these help me expand my creativity through building.</p>
          <p>Not the kind born from sitting down and asking what should I build?</p>

          <p>The kind that starts when something ordinary bothers you just enough that you start becoming aware and noticing it. You notice the extra clicks. You observe the repeated searches. You become aware of the small inconveniences that nobody seems to think about that has become normal.</p>
          <p>Instead of placing that in the list of usual things, you start to use your editor.</p>
          <p><strong>Sometimes, people don’t realize certain problems they face until someone points them out. </strong></p>
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
              assignment, submission, due-date, score, grade, and status data
              needed to show your gradebook. Basic request and error details
              may be processed for security and reliability.
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
      grade: calculateGroupGrade(assignments, values),
      totals: groupPointTotals(assignments, values),
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
    <main className="grades-shell">
      <SignedInNav
        data={data}
        user={user}
        disconnect={disconnect}
        signOut={signOut}
        deleteAccount={deleteAccount}
      />

      <section className="details-content">
        <header className="course-header">
          <div>
            <p>{course.code}</p>
            <h1>{course.name}</h1>
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
                          {assignment.htmlUrl ? (
                            <a
                              href={assignment.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {assignment.title}
                            </a>
                          ) : (
                            <span className="assignment-name">
                              {assignment.title}
                            </span>
                          )}

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
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [accountAction, setAccountAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    function returnToGrades() {
      setSelectedCourseId(null);
    }

    window.addEventListener("popstate", returnToGrades);
    return () => window.removeEventListener("popstate", returnToGrades);
  }, []);

  function openCourse(courseId) {
    window.history.pushState({ moofieCourse: courseId }, "");
    setSelectedCourseId(courseId);
  }

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
          setData(null);
          setSelectedCourseId(null);
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

    loadCanvasDashboard()
      .then((dashboard) => {
        const nextData = sanitizeDashboard(
          dashboard?.connected === false ? null : dashboard,
        );
        setData(nextData);
        writeDashboardCache(session.user.id, nextData);
      })
      .catch(() => {
        if (!cache.found) setData(null);
      })
      .finally(() => setRestoring(false));
  }, [session?.user?.id]);

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
        writeDashboardCache(session.user.id, null);
        setData(null);
        setSelectedCourseId(null);
      } else if (accountAction === "signout") {
        clearDashboardCache();
        await supabase?.auth.signOut();
      } else if (accountAction === "delete") {
        await deleteMoofieAccount();
        clearDashboardCache();
        setData(null);
        setSelectedCourseId(null);
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

  if (!data) {
    return withAccountDialog(
      <ConnectScreen
        onConnect={(dashboard) => setData(sanitizeDashboard(dashboard))}
        onSignOut={signOut}
        onDeleteAccount={deleteAccount}
      />,
    );
  }

  const selectedCourse = data.courses.find(
    (course) => course.id === selectedCourseId,
  );
  const accountHandlers = { disconnect, signOut, deleteAccount };

  if (selectedCourse) {
    return withAccountDialog(
      <CourseDetails
        course={selectedCourse}
        data={data}
        user={session.user}
        {...accountHandlers}
      />
    );
  }

  return withAccountDialog(
    <GradesHome
      data={data}
      user={session.user}
      openCourse={openCourse}
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
