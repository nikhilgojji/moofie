// Shared page chrome lives here so every screen uses the same navigation,
// theme behavior, footer links, and account controls.
import { useEffect, useRef, useState } from "react";

// Remember the explicit choice under one stable browser-storage key.
const THEME_STORAGE_KEY = "moofie-theme";

// Prefer a saved choice, then fall back to the operating-system color scheme.
function getInitialTheme() {
  let savedTheme;
  try {
    savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Browser privacy settings may make persistent storage unavailable.
  }
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

// Apply and persist dark/light mode while exposing an accessible toggle button.
export function ThemeToggle() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme still applies to this tab without persistence.
    }
  }, [theme]);

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => setTheme(nextTheme)}
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
        <img src="/bobcat.png" alt="" aria-hidden="true" />
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
export function SignedInNav({ data, user, disconnect, signOut, deleteAccount }) {
  const profileMenuRef = useRef(null);
  const accountName =
    data.profile.short_name ||
    data.profile.name ||
    user?.user_metadata?.full_name ||
    "Moofie user";
  const accountEmail = user?.email || "No email available";

  // A native details element supplies keyboard behavior; this effect adds outside-click closing.
  useEffect(() => {
    function closeProfileMenu(event) {
      const menu = profileMenuRef.current;
      if (menu?.open && !menu.contains(event.target)) menu.removeAttribute("open");
    }

    document.addEventListener("pointerdown", closeProfileMenu);
    return () => document.removeEventListener("pointerdown", closeProfileMenu);
  }, []);

  return (
    <header className="topbar signed-in-nav">
      <a className="wordmark" href="/">
        <span>Moofie</span>
        <img src="/bobcat.png" alt="" aria-hidden="true" />
      </a>
      <div className="signed-in-nav-actions">
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
