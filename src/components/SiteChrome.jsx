// Shared page chrome lives here so every screen uses the same navigation,
// theme behavior, footer links, and account controls.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushNotificationStatus,
} from "../pushNotifications";

// Remember the explicit choice under one stable browser-storage key.
import { applyTheme, getInitialTheme, THEME_STORAGE_KEY } from "../utils/theme";

function formatCourseName(name) {
  return String(name ?? "")
    .trim()
    .replace(/^[A-Z]\d{2}-/i, "")
    .replace(/\s+\d{2}$/, "");
}

function formatNotificationTime(value) {
  if (!value) return "Recently updated";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

// Apply and persist dark/light mode while exposing an accessible toggle button.
export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => {
        setTheme(nextTheme);
        try { localStorage.setItem(THEME_STORAGE_KEY, nextTheme); } catch { /* Apply without persistence. */ }
      }}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41
              1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5 8.5 8.5 0 1 0 20.5 14.3Z" />
        </svg>
      )}
    </button>
  );
}

// Header used on signed-out and informational pages.
export function PublicNav({ label = "Public page navigation" }) {
  return (
    <header className="access-header public-header">
      <a className="wordmark" href="/">
        <span>Moofie</span>
      </a>
      <nav className="access-nav" aria-label={label}>
        <ThemeToggle />
        <a href="/about">About</a>
      </nav>
    </header>
  );
}

// Reusable legal footer shown underneath every top-level route.
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>Moofie © 2026</span>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </footer>
  );
}

// Signed-in header combines project navigation with account-management actions.
export function SignedInNav({
  data,
  user,
  activeView = "home",
  onNavigate,
  disconnect,
  signOut,
  deleteAccount,
}) {
  const profileMenuRef = useRef(null);
  const notificationsMenuRef = useRef(null);
  const notificationsKey = `moofie-grade-notifications-seen:${user?.id}`;
  const gradeNotifications = useMemo(
    () =>
      data.courses
        .flatMap((course) =>
          (course.assignments || [])
            .filter(
              (assignment) =>
                assignment.earned !== null && assignment.earned !== undefined,
            )
            .map((assignment) => ({
              id: `${course.id}-${assignment.id}`,
              assignment,
              courseName: formatCourseName(course.name),
              updatedAt: assignment.gradedAt || assignment.updatedAt,
            })),
        )
        .sort(
          (left, right) =>
            new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0),
        )
        .slice(0, 20),
    [data.courses],
  );
  const [notificationsSeenAt, setNotificationsSeenAt] = useState(() => {
    try {
      return Number(localStorage.getItem(notificationsKey)) || Date.now();
    } catch {
      return Date.now();
    }
  });
  const [pushStatus, setPushStatus] = useState("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const unreadCount = gradeNotifications.filter(
    (notification) =>
      notification.updatedAt &&
      new Date(notification.updatedAt).getTime() > notificationsSeenAt,
  ).length;
  const accountName =
    data.profile.short_name ||
    data.profile.name ||
    user?.user_metadata?.full_name ||
    "Moofie user";
  const accountEmail = user?.email || "No email available";

  // A native details element supplies keyboard behavior; this effect adds outside-click closing.
  useEffect(() => {
    try {
      if (!localStorage.getItem(notificationsKey)) {
        localStorage.setItem(notificationsKey, String(notificationsSeenAt));
      }
    } catch {
      // Notifications still work for this page view without persistence.
    }
  }, [notificationsKey, notificationsSeenAt]);

  useEffect(() => {
    function closeMenus(event) {
      [profileMenuRef.current, notificationsMenuRef.current].forEach((menu) => {
        if (menu?.open && !menu.contains(event.target)) {
          menu.removeAttribute("open");
        }
      });
    }

    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, []);

  useEffect(() => {
    let active = true;
    getPushNotificationStatus()
      .then((status) => {
        if (active) setPushStatus(status);
      })
      .catch(() => {
        if (active) setPushStatus("available");
      });
    return () => {
      active = false;
    };
  }, [user?.id]);

  function markNotificationsSeen(event) {
    if (!event.currentTarget.open) return;
    const seenAt = Date.now();
    setNotificationsSeenAt(seenAt);
    try {
      localStorage.setItem(notificationsKey, String(seenAt));
    } catch {
      // The unread state remains correct until this page is closed.
    }
  }

  async function togglePushNotifications() {
    setPushBusy(true);
    setPushError("");
    try {
      const status =
        pushStatus === "enabled"
          ? await disablePushNotifications()
          : await enablePushNotifications();
      setPushStatus(status);
    } catch (error) {
      setPushError(error.message || "Moofie could not update phone alerts.");
      setPushStatus(await getPushNotificationStatus().catch(() => "available"));
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <header className="topbar signed-in-nav">
      <a
        className="wordmark"
        href="/"
        onClick={(event) => {
          if (!onNavigate) return;
          event.preventDefault();
          onNavigate("home");
        }}
      >
        <span>Moofie</span>
      </a>
      <nav className="app-view-nav" aria-label="Moofie sections">
        <button
          className={activeView === "home" ? "is-active" : ""}
          type="button"
          aria-current={activeView === "home" ? "page" : undefined}
          onClick={() => onNavigate?.("home")}
        >
          Home
        </button>
        <button
          className={activeView === "grades" ? "is-active" : ""}
          type="button"
          aria-current={activeView === "grades" ? "page" : undefined}
          onClick={() => onNavigate?.("grades")}
        >
          Grades
        </button>
      </nav>
      <div className="signed-in-nav-actions">
        <details
          className="notifications-menu"
          ref={notificationsMenuRef}
          onToggle={markNotificationsSeen}
        >
          <summary aria-label="Open grade notifications" title="Notifications">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
            {unreadCount > 0 && (
              <span className="notification-count">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </summary>
          <div className="notifications-panel">
            <div className="notifications-heading">
              <strong>Grade updates</strong>
              <span>Latest posted and changed grades</span>
            </div>
            <div className="push-notification-setting">
              <div>
                <strong>Phone alerts</strong>
                <span>
                  {pushStatus === "enabled"
                    ? "On for this device"
                    : pushStatus === "denied"
                      ? "Blocked in device settings"
                      : pushStatus === "unsupported"
                        ? "On iPhone, add Moofie to your Home Screen first"
                        : "Get new and updated grades on your lock screen"}
                </span>
              </div>
              {(pushStatus === "enabled" || pushStatus === "available") && (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={togglePushNotifications}
                >
                  {pushBusy
                    ? "Working..."
                    : pushStatus === "enabled"
                      ? "Turn off"
                      : "Turn on"}
                </button>
              )}
              {pushError && <p role="alert">{pushError}</p>}
            </div>
            {gradeNotifications.length === 0 ? (
              <p className="notifications-empty">No grade updates yet.</p>
            ) : (
              <div className="notifications-list">
                {gradeNotifications.map((notification) => {
                  const content = (
                    <>
                      <strong>{notification.assignment.title}</strong>
                      <span>
                        {notification.courseName} · {notification.assignment.earned}
                        {notification.assignment.points
                          ? ` / ${notification.assignment.points} pts`
                          : " pts"}
                      </span>
                      <time>{formatNotificationTime(notification.updatedAt)}</time>
                    </>
                  );

                  return <div key={notification.id}>{content}</div>;
                })}
              </div>
            )}
          </div>
        </details>
        <ThemeToggle />
        <a href="/about">About</a>
        <details className="profile-menu" ref={profileMenuRef}>
          <summary aria-label="Open profile menu" title="Profile">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
            </svg>
          </summary>
          <div className="profile-menu-panel">
            <div className="profile-menu-identity">
              <strong>{accountName}</strong>
              <span>{accountEmail}</span>
            </div>
            <div className="profile-menu-actions">
              <button onClick={disconnect}>Disconnect Canvas</button>
              <button onClick={signOut}>Sign out</button>
              <button className="danger-action" onClick={deleteAccount}>
                Delete account
              </button>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
