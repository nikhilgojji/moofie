// Moofie is light-only, including browsers with an old dark-mode preference.
(() => {
  try {
    localStorage.removeItem("moofie-theme");
  } catch { /* Light mode also works when browser storage is unavailable. */ }
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#f7f6f2");
})();
