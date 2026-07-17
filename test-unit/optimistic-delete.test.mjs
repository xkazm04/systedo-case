/** Unit tests for the shared optimistic-delete guard: rollback fires on a non-ok
 *  response and on a thrown request, never on success, and reload always runs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { optimisticDelete } from "@/lib/optimistic-delete";

test("optimisticDelete: success → no rollback, reload runs, resolves true", async () => {
  let rolledBack = false;
  let reloaded = false;
  const ok = await optimisticDelete(
    async () => ({ ok: true }),
    () => {
      rolledBack = true;
    },
    () => {
      reloaded = true;
    }
  );
  assert.equal(ok, true);
  assert.equal(rolledBack, false);
  assert.equal(reloaded, true);
});

test("optimisticDelete: non-ok response → rollback + reload, resolves false", async () => {
  let rolledBack = false;
  let reloaded = false;
  const ok = await optimisticDelete(
    async () => ({ ok: false }),
    () => {
      rolledBack = true;
    },
    () => {
      reloaded = true;
    }
  );
  assert.equal(ok, false);
  assert.equal(rolledBack, true);
  assert.equal(reloaded, true);
});

test("optimisticDelete: thrown request → rollback + reload, resolves false", async () => {
  let rolledBack = false;
  let reloaded = false;
  const ok = await optimisticDelete(
    async () => {
      throw new Error("offline");
    },
    () => {
      rolledBack = true;
    },
    () => {
      reloaded = true;
    }
  );
  assert.equal(ok, false);
  assert.equal(rolledBack, true);
  assert.equal(reloaded, true);
});

test("optimisticDelete: reload runs even when it is async", async () => {
  const order = [];
  await optimisticDelete(
    async () => ({ ok: true }),
    () => order.push("rollback"),
    async () => {
      await Promise.resolve();
      order.push("reload");
    }
  );
  assert.deepEqual(order, ["reload"]);
});
