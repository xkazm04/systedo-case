/** Pure validator for the alert-inbox POST action. Kept out of ./alerts (which
 *  pulls in firebase) so it stays trivially unit-testable and free of side effects.
 *
 *  The route previously dispatched only on action==="acknowledge" and let EVERYTHING
 *  else — a typo, a newer client's action string, a malformed/absent body — fall
 *  through to markAlertsRead(tenant, undefined), which is the mark-EVERY-alert-read
 *  bulk path: one version-skewed or buggy call could irreversibly wipe the whole
 *  inbox's unread state. This whitelists the known actions and rejects the rest. */
export type AlertActionPlan =
  | { kind: "acknowledge"; id: string }
  | { kind: "read"; id: string }
  | { kind: "readAll" }
  | { error: string; status: number };

export function planAlertAction(body: { action?: unknown; id?: unknown }): AlertActionPlan {
  const action = typeof body.action === "string" ? body.action : undefined;
  const id = typeof body.id === "string" && body.id ? body.id : undefined;

  switch (action) {
    case "acknowledge":
      if (!id) return { error: "Chybí ID upozornění.", status: 422 };
      return { kind: "acknowledge", id };
    case "read":
      if (!id) return { error: "Chybí ID upozornění.", status: 422 };
      return { kind: "read", id };
    case "readAll":
      return { kind: "readAll" };
    default:
      // Unknown / missing action (including an unreadable body) is rejected rather
      // than defaulting to the destructive bulk mark-all.
      return { error: "Neznámá akce.", status: 400 };
  }
}
