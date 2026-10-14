import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("first paint stays light and clears old theme preferences even on dark devices", () => {
  const source = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");
  for (const saved of [null, "light", "dark", "invalid", "blocked"]) {
    let preference = saved;
    const storage = { getItem: () => preference, removeItem: () => { if (saved === "blocked") throw Error("Storage disabled"); preference = null; } };
    const document = { documentElement: { dataset: {}, style: {} }, querySelector: () => null };
    runInNewContext(source, { document, localStorage: storage });
    assert.equal(document.documentElement.dataset.theme, "light");
    assert.equal(document.documentElement.style.colorScheme, "light");
    if (saved !== "blocked") assert.equal(preference, null);
  }
});
