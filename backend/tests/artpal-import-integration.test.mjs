import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const importerSource = readFileSync(new URL("../services/universalStoreImporter.js", import.meta.url), "utf8");
const guardUrl = new URL("../services/artpalAccessGuard.js", import.meta.url).href;

async function loadImporter(db) {
  const source = importerSource
    .replace('import supabase from "../lib/supabase.js";', "const supabase = globalThis.__artpalMockDb;")
    .replace('from "./artpalAccessGuard.js";', `from "${guardUrl}";`);
  globalThis.__artpalMockDb = db;
  const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
  return (await import(moduleUrl)).importUniversalStore;
}

function makeDatabase() {
  const writes = [];
  const connection = {
    id: "artpal-store",
    user_id: "test-user",
    platform: "artpal",
    store_name: "Test ArtPal",
    store_url: "https://www.artpal.com/testartist",
    connected: true,
    metadata: {},
  };
  const db = {
    from(table) {
      if (table !== "store_connections") {
        writes.push({ table, action: "access" });
        throw new Error("Product catalog must not be accessed on denied scan");
      }
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return { maybeSingle: async () => ({ data: connection, error: null }) };
                },
              };
            },
          };
        },
        update(value) {
          writes.push({ table, action: "update", value });
          throw new Error("Connection status must not be updated on denied scan");
        },
      };
    },
  };
  return { db, writes };
}

async function runDeniedScan(fetchMock, maxPages = 2) {
  const originalFetch = globalThis.fetch;
  const { db, writes } = makeDatabase();
  const importer = await loadImporter(db);
  globalThis.fetch = fetchMock;
  try {
    await assert.rejects(
      importer({ userId: "test-user", storeId: "artpal-store", maxPages }),
      /ArtPal denied storefront access/
    );
    assert.deepEqual(writes, [], "failed scan must leave products and store connection unchanged");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__artpalMockDb;
  }
}

function response(html, status, url) {
  return { ok: status >= 200 && status < 300, status, url, text: async () => html };
}

test("HTTP 403 on first page preserves catalog", async () => {
  await runDeniedScan(async (url) => response("Forbidden", 403, url), 1);
});

test("HTTP 403 after valid first-page links preserves catalog", async () => {
  await runDeniedScan(async (url) =>
    url.includes("page=2")
      ? response("Forbidden", 403, url)
      : response('<a href="https://www.artpal.com/artwork/example">Artwork</a>', 200, url)
  );
});

test("HTTP 200 Cloudflare challenge preserves catalog", async () => {
  await runDeniedScan(async (url) =>
    response("<html><title>Just a moment...</title><p>Cloudflare security verification</p></html>", 200, url), 1
  );
});
