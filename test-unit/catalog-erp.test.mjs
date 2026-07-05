/** Unit tests for the generic ERP adapter: config validation, payload parsing
 *  (JSON path + CSV), field mapping + coercions, the credential-free demo, and the
 *  connection store round-tripping the ERP config. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_ERP_CONFIG,
  ErpError,
  demoErpProducts,
  fetchErpProductsFromText,
  mapErpRows,
  parseErpConfig,
  parseErpPayload,
} from "@/lib/inventory/erp";
import {
  deleteConnection,
  getConnection,
  saveConnection,
} from "@/lib/inventory/connection-store.local.ts";

test("parseErpConfig validates + normalizes", () => {
  const cfg = parseErpConfig({
    endpoint: " https://erp.example.cz/api ",
    format: "csv",
    auth: "bearer",
    mapping: { sku: "code", name: "title", price: "cena", junk: "x" },
  });
  assert.equal(cfg.endpoint, "https://erp.example.cz/api");
  assert.equal(cfg.format, "csv");
  assert.equal(cfg.auth, "bearer");
  assert.deepEqual(cfg.mapping, { sku: "code", name: "title", price: "cena" });

  assert.equal(parseErpConfig({ endpoint: "x", mapping: { sku: "s", name: "n" } }).format, "json"); // default
  assert.throws(() => parseErpConfig({ mapping: { sku: "s", name: "n" } }), ErpError); // no endpoint
  assert.throws(() => parseErpConfig({ endpoint: "x", mapping: { sku: "s" } }), ErpError); // no name
  assert.throws(() => parseErpConfig(null), ErpError);
});

test("parseErpPayload: JSON path, root array, CSV, and errors", () => {
  const cfg = { format: "json", itemsPath: "data.products" };
  const rows = parseErpPayload(JSON.stringify({ data: { products: [{ a: 1 }, { a: 2 }] } }), cfg);
  assert.equal(rows.length, 2);

  const rootRows = parseErpPayload(JSON.stringify([{ a: 1 }]), { format: "json" });
  assert.equal(rootRows.length, 1);

  const csvRows = parseErpPayload("sku;name;price\nA1;Alpha;10\nB2;Beta;20", { format: "csv" });
  assert.deepEqual(csvRows[0], { sku: "A1", name: "Alpha", price: "10" });

  assert.throws(() => parseErpPayload("{not json", { format: "json" }), ErpError);
  assert.throws(() => parseErpPayload(JSON.stringify({ x: 1 }), { format: "json", itemsPath: "data.products" }), ErpError);
});

test("mapErpRows: maps fields, coerces price/stock/margin, skips row without SKU", () => {
  const products = mapErpRows(
    [
      { code: "A1", title: "Alpha", cena: "1 299,00 Kč", qty: "12", m: "35" },
      { code: "", title: "No SKU", cena: "9" }, // dropped
      { code: "B2", title: "Beta", cena: "0,50", qty: "3", m: "0.4" },
    ],
    { sku: "code", name: "title", price: "cena", stock: "qty", margin: "m" }
  );
  assert.equal(products.length, 2);
  assert.equal(products[0].sku, "A1");
  assert.equal(products[0].price, 1299);
  assert.equal(products[0].stock, 12);
  assert.equal(products[0].margin, 0.35); // 35 read as a percentage
  assert.equal(products[1].price, 0.5);
  assert.equal(products[1].margin, 0.4); // already a fraction
});

test("demo ERP runs the sample through the real parse+map engine", () => {
  const products = demoErpProducts();
  assert.equal(products.length, 6);
  assert.equal(products[0].sku, "ERP-KESU-1");
  assert.equal(products[0].price, 349);
  assert.equal(products[0].stock, 42);
  // round-trip via the shared text core with the demo config
  const viaText = fetchErpProductsFromText(
    JSON.stringify({ data: { products: [{ code: "X", title: "Y", priceVat: "5", onHand: "1" }] } }),
    DEMO_ERP_CONFIG
  );
  assert.equal(viaText[0].sku, "X");
});

test("connection store round-trips the ERP config", async () => {
  const uid = "erp-test-user";
  const pid = "erp-test-proj";
  const config = { endpoint: "https://erp.example.cz/api", format: "json", auth: "none", mapping: { sku: "code", name: "title" } };
  await saveConnection(uid, pid, { provider: "erp", config, connectedAt: "2026-07-05T00:00:00.000Z" });
  const c = await getConnection(uid, pid);
  assert.ok(c);
  assert.equal(c.provider, "erp");
  assert.deepEqual(c.config, config);
  await deleteConnection(uid, pid);
  assert.equal(await getConnection(uid, pid), null);
});
