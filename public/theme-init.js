// Run before styles and React so the first paint matches the saved preference.
(() => {
  let theme = "light";
  try {
    if (localStorage.getItem("moofie-theme") === "dark") theme = "dark";
  } catch { /* New visitors and restricted storage start in light mode. */ }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0b0c" : "#f7f6f2");
})();
