"use client";

import type { Budget, Disposition, Qualification, Scope, Timeline } from "@/lib/speed-lead/qualification";

/** Static Czech-only option lists used exclusively in the AI prompt helper
 *  describeQualification — not rendered to the user. */
const TIMELINE_OPTIONS_CS: { value: Timeline; label: string }[] = [
  { value: "unknown", label: "—" },
  { value: "asap", label: "Co nejdříve" },
  { value: "weeks", label: "Do několika týdnů" },
  { value: "exploring", label: "Jen zjišťuje" },
];
const BUDGET_OPTIONS_CS: { value: Budget; label: string }[] = [
  { value: "unknown", label: "—" },
  { value: "confirmed", label: "Potvrzený" },
  { value: "flexible", label: "Flexibilní" },
  { value: "tight", label: "Omezený" },
];
const SCOPE_OPTIONS_CS: { value: Scope; label: string }[] = [
  { value: "unknown", label: "—" },
  { value: "large", label: "Velký" },
  { value: "medium", label: "Střední" },
  { value: "small", label: "Malý" },
];
const DISPOSITION_OPTIONS_CS: { value: Disposition; label: string }[] = [
  { value: "hot", label: "Horký" },
  { value: "warm", label: "Vlažný" },
  { value: "cold", label: "Studený" },
];

/** Compact Czech summary of the captured BANT fields, skipping unanswered ones —
 *  fed to the AI reply so it doesn't re-ask what the rep already qualified and can
 *  match its tone to the lead's disposition. */
export function describeQualification(q: Qualification): string {
  const label = (opts: { value: string; label: string }[], v: string) =>
    opts.find((o) => o.value === v)?.label ?? v;
  const parts: string[] = [];
  if (q.timeline && q.timeline !== "unknown") parts.push(`termín: ${label(TIMELINE_OPTIONS_CS, q.timeline)}`);
  if (q.budget && q.budget !== "unknown") parts.push(`rozpočet: ${label(BUDGET_OPTIONS_CS, q.budget)}`);
  if (q.scope && q.scope !== "unknown") parts.push(`rozsah: ${label(SCOPE_OPTIONS_CS, q.scope)}`);
  if (q.disposition) parts.push(`hodnocení: ${label(DISPOSITION_OPTIONS_CS, q.disposition)}`);
  return parts.join(", ");
}
