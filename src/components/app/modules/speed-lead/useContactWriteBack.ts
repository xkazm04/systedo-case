"use client";

import { useState } from "react";
import { qualifyPatch } from "@/lib/speed-lead/inbox-source";
import type { Qualification } from "@/lib/speed-lead/qualification";
import type { InboundLead } from "@/lib/speed-lead/sample";

/** Writes the inbox's two operator decisions back onto a LIVE CRM contact through
 *  the existing contacts PATCH route (ownership-checked there):
 *   - `markReplied` records `firstRespondedAt` — the operator's own declaration that
 *     they answered, the same semantics as Leady's queue "advance". It RECORDS a
 *     reply; nothing is sent to the lead from here.
 *   - `qualify` stores the BANT capture and moves an open contact to `qualified`
 *     (`qualifyPatch` — never a regression), which the stage move turns into a
 *     conversion-ledger row.
 *  A sample row has no `contactId`, so both resolve false without a request. */
export function useContactWriteBack(projectId: string) {
  const [qualifiedIds, setQualifiedIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  async function patch(lead: InboundLead, body: object): Promise<boolean> {
    if (!lead.contactId) return false;
    setPendingId(lead.id);
    setFailedId(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/crm/contacts/${encodeURIComponent(lead.contactId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) setFailedId(lead.id);
      return res.ok;
    } catch {
      setFailedId(lead.id);
      return false;
    } finally {
      setPendingId(null);
    }
  }

  const markReplied = (lead: InboundLead) => patch(lead, { firstRespondedAt: true });

  async function qualify(lead: InboundLead, q: Qualification): Promise<boolean> {
    const ok = await patch(lead, qualifyPatch(q, { stage: lead.stage }));
    if (ok) setQualifiedIds((s) => new Set(s).add(lead.id));
    return ok;
  }

  return { markReplied, qualify, qualifiedIds, pendingId, failedId };
}
