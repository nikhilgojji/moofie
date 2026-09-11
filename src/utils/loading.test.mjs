import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { getInitialTheme } from "./theme.js";
import { createRequestCache } from "./requestCache.js";

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

test("concurrent course reads share a request, expire, and remain account-scoped", async () => {
  let time = 0, calls = 0;
  const cache = createRequestCache({ ttl: 60, now: () => time });
  const fetcher = async () => ++calls;
  assert.deepEqual(await Promise.all([cache.read("A", "course", fetcher), cache.read("A", "course", fetcher)]), [1, 1]);
  assert.equal(await cache.read("A", "course", fetcher), 1);
  assert.equal(await cache.read("B", "course", fetcher), 2);
  time = 61;
  assert.equal(await cache.read("A", "course", fetcher), 3);
  cache.clear();
  assert.equal(await cache.read("A", "course", fetcher), 4);
});

test("failed and invalidated in-flight requests cannot poison subsequent loads", async () => {
  const cache = createRequestCache();
  await assert.rejects(cache.read("A", "course", () => Promise.reject(Error("Offline"))), /Offline/);
  assert.equal(await cache.read("A", "course", () => "Recovered"), "Recovered");
  let finish;
  const pending = cache.read("A", "profile", () => new Promise(resolve => { finish = resolve; }));
  await Promise.resolve();
  cache.clear();
  finish("Old connection");
  await pending;
  assert.equal(await cache.read("A", "profile", () => "New connection"), "New connection");
});
