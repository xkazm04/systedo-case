/** Shared optimistic-delete guard for list UIs that remove a row before the
 *  server confirms. The classic bug this fixes: remove the row from state, fire a
 *  DELETE, then swallow failures — so a 401/500/offline delete leaves the UI lying
 *  (the row is gone locally but still on the server) until the next reload
 *  resurrects it. Pass a `rollback` that restores the pre-delete snapshot; it runs
 *  whenever the request throws OR resolves non-ok, and a `reload` reconciles with
 *  the server either way (removing the row on success, keeping it on failure).
 *
 *  Usage (React):
 *    const prev = items;
 *    setItems((p) => p.filter((x) => x.id !== id));
 *    await optimisticDelete(
 *      () => fetch(url, { method: "DELETE", ... }),
 *      () => setItems(prev),
 *      load,
 *    );
 *
 *  Pure over its callbacks (no React, no fetch of its own), so the ok / non-ok /
 *  throw branches are unit-testable without the DOM or a live endpoint. */
export async function optimisticDelete(
  request: () => Promise<{ ok: boolean }>,
  rollback: () => void,
  reload: () => void | Promise<void>
): Promise<boolean> {
  try {
    const res = await request();
    if (!res.ok) {
      rollback();
      return false;
    }
    return true;
  } catch {
    rollback();
    return false;
  } finally {
    await reload();
  }
}
