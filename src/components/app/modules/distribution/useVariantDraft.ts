/** The editable, persisted draft behind one variant card.
 *
 *  Everything that changes what a card would SHIP goes through here, so the card
 *  survives a tab switch and a refresh. Fire-and-forget by contract: a failed save
 *  must never turn a working copy/handoff into an error — the text stays on screen
 *  either way, exactly as it did before this store existed.
 *
 *  Extracted from VariantCard so the card is layout + intent and this is the state
 *  machine (AGENTS.md: extract data hooks rather than grow the module file). */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  advanceStatus,
  type StoredVariant,
  type VariantState,
  type VariantStatus,
} from "@/lib/distribution/variants";
import { saveVariantAction } from "@/components/app/modules/distribution-actions";

/** How long typing must pause before the draft is written. One write per pause
 *  instead of one per character. */
const SAVE_DEBOUNCE_MS = 900;

export interface VariantDraft {
  text: string;
  setText: (next: string | ((prev: string) => string)) => void;
  /** persisted status, or null while nothing has ever been stored for this channel */
  status: VariantStatus | null;
  /** the draft left the app (copied, exported, scheduled) — advances the status */
  handedOff: () => void;
  /** adopt model output as the current text without marking it hand-edited */
  applyGenerated: (next: string) => void;
  /** forget the applied model output — a fresh generation is starting */
  clearGenerated: () => void;
  /** the model text currently adopted, or null; `text === generated` is what makes
   *  the AI pill honest after a hand-edit */
  generated: string | null;
}

export function useVariantDraft({
  channel,
  initialText,
  articleKey,
  articleTitle,
  projectId,
  storedStatus,
  onPersisted,
}: {
  channel: string;
  initialText: string;
  articleKey: string;
  articleTitle: string;
  projectId: string;
  storedStatus: VariantStatus | null;
  onPersisted: (state: VariantState) => void;
}): VariantDraft {
  const [text, setText] = useState(initialText);
  const [status, setStatus] = useState<VariantStatus | null>(storedStatus);
  const statusRef = useRef<VariantStatus | null>(storedStatus);
  /** Text that is verbatim the model's output — anything typed on top of it reads
   *  as `edited`, so the badge distinguishes "the AI wrote this" from "I reworked it". */
  const [generated, setGenerated] = useState<string | null>(null);

  const persist = useCallback(
    (nextText: string, event: VariantStatus, textChanged: boolean) => {
      const next = advanceStatus(statusRef.current ?? undefined, event, textChanged);
      statusRef.current = next;
      setStatus(next);
      const entry: StoredVariant = {
        channel,
        text: nextText,
        status: next,
        updatedAt: new Date().toISOString(),
      };
      void saveVariantAction(projectId, articleKey, articleTitle, channel, entry)
        .then((state) => {
          // Unowned project (the demo surface) → the action stores nothing and
          // returns null; don't pretend it was saved.
          if (state) onPersisted(state);
        })
        .catch(() => {
          /* best-effort */
        });
    },
    [articleKey, articleTitle, channel, onPersisted, projectId]
  );

  /** The last text handed to the store — the debounce compares against it so simply
   *  opening the module never writes anything for a fresh project. */
  const savedText = useRef(initialText);
  useEffect(() => {
    if (text === savedText.current) return;
    const id = setTimeout(() => {
      savedText.current = text;
      persist(text, text === generated ? "generated" : "edited", true);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text, generated, persist]);

  /** Applied once per arrival DURING render (avoids a set-state-in-effect
   *  cascade); manual edits on top of it then stick. */
  const applyGenerated = useCallback((next: string) => {
    setGenerated(next);
    setText(next);
  }, []);
  const clearGenerated = useCallback(() => setGenerated(null), []);

  // A handoff does not change the text — it changes how far along it is. The
  // publish EVENT (activity feed) and the variant STATUS answer different
  // questions: "what left the app and when" vs "which variant is already done the
  // next time this page opens".
  const handedOff = useCallback(() => persist(text, "handed_off", false), [persist, text]);

  return { text, setText, status, handedOff, applyGenerated, clearGenerated, generated };
}
