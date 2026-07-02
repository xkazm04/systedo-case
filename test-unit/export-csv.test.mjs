/** csvNum (format-helpers #4): locale-parseable numeric cells for the Czech-
 *  Excel CSV exports. Runs the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { csvNum, toCsv } from "@/lib/export";

test("csvNum renders cs decimal commas without grouping", () => {
  assert.equal(csvNum(0.85, 2), "0,85");
  assert.equal(csvNum(0.85, 4), "0,85"); // no trailing-zero padding
  assert.equal(csvNum(5.6, 2), "5,6");
  assert.equal(csvNum(1234.5, 2), "1234,5"); // grouping disabled — no space to split the cell
  assert.equal(csvNum(42, 2), "42");
});

test("csvNum follows the en locale and degrades non-finite values to the empty cell", () => {
  assert.equal(csvNum(0.85, 2, "en"), "0.85");
  assert.equal(csvNum(Number.NaN, 2), "");
  assert.equal(csvNum(Infinity, 2), "");
});

test("toCsv keeps a decimal-comma cell intact behind the semicolon delimiter", () => {
  const csv = toCsv(["kanál", "PNO"], [["PPC", csvNum(0.8532, 4)]]);
  const [header, row] = csv.split("\r\n");
  assert.equal(header, "kanál;PNO");
  // the comma triggers csvField quoting, but never splits the cell
  assert.equal(row.split(";").length, 2);
  assert.ok(row.includes("0,8532"));
});
