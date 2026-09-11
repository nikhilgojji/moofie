export const THEME_STORAGE_KEY = "moofie-theme";

export function getInitialTheme(storage) {
  try {
    const saved = (storage ?? globalThis.localStorage)?.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* Storage is optional. */ }
  return "light";
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0b0c" : "#f7f6f2");
}
