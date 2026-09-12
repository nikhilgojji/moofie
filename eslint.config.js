import globals from "globals";
export default [{
  files: ["src/**/*.{js,jsx}"],
  languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser, ...globals.worker } },
  rules: { "no-undef": "error", "no-unreachable": "error", "no-dupe-keys": "error", "no-constant-condition": ["error", { checkLoops: false }] },
}];
