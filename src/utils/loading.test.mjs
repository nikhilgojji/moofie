import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { getInitialTheme } from "./theme.js";

test("first paint and React default to light and preserve explicit theme choices", () => {
  const source = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");
  for (const saved of [null, "light", "dark", "invalid"]) {
    const storage = { getItem: () => saved };
    const document = { documentElement: { dataset: {}, style: {} }, querySelector: () => null };
    runInNewContext(source, { document, localStorage: storage });
    assert.equal(document.documentElement.dataset.theme, saved === "dark" ? "dark" : "light");
    assert.equal(getInitialTheme(storage), document.documentElement.dataset.theme);
  }
  assert.equal(getInitialTheme({ getItem() { throw Error("Storage disabled"); } }), "light");
});
