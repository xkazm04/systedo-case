"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** Bump when a persisted draft's wrapper shape changes, so a stale entry from a
 *  previous deploy is dropped on restore instead of hydrated against new fields. */
const FORM_SCHEMA_VERSION = 1;

/** localStorage key for a tool's form draft — the "what I typed" sibling of the
 *  result slot (`systedo.ai.result.*`) useAiTool already persists. */
const formKey = (name: string) => `systedo.ai.form.${name}`;

interface StoredForm {
  v: number;
  value: unknown;
}

/** useState that survives a refresh, mirroring useAiTool's storage conventions:
 *  effect-based restore (server render and first client render stay identical —
 *  no hydration mismatch), a versioned wrapper, write-through on change and
 *  try/catch around every storage touch. With results AND inputs persisted, a
 *  restored result no longer sits next to an empty form the user can't
 *  tweak-and-regenerate from.
 *
 *  Options:
 *  - `skipRestore` — don't read the stored draft on mount (a cross-tool seed
 *    must win over an old draft); changes are still written through.
 *  - `validate` — type guard for the restored value; without it, an object
 *    initial merges the stored draft over itself (tolerates added fields) and a
 *    primitive initial requires a matching typeof. Anything else is dropped. */
export function usePersistedForm<T>(
  name: string,
  initial: T,
  opts?: { skipRestore?: boolean; validate?: (v: unknown) => v is T }
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(initial);

  // Restore once on mount. Declared BEFORE the write-through effect: on mount it
  // reads the stored draft first, so the initial write below can't clobber it.
  useEffect(() => {
    if (opts?.skipRestore) return;
    try {
      const raw = window.localStorage.getItem(formKey(name));
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<StoredForm> | null;
      if (!stored || stored.v !== FORM_SCHEMA_VERSION || stored.value === undefined) {
        window.localStorage.removeItem(formKey(name));
        return;
      }
      let restored: T | undefined;
      if (opts?.validate) {
        if (opts.validate(stored.value)) restored = stored.value;
      } else if (
        initial !== null &&
        typeof initial === "object" &&
        !Array.isArray(initial) &&
        stored.value !== null &&
        typeof stored.value === "object" &&
        !Array.isArray(stored.value)
      ) {
        restored = { ...initial, ...(stored.value as Partial<T>) };
      } else if (typeof stored.value === typeof initial) {
        restored = stored.value as T;
      }
      if (restored === undefined) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(restored);
    } catch {
      /* corrupt or unavailable storage — keep the initial value */
    }
    // Restore is a mount-only external-store sync; name/opts/initial are stable
    // for a mounted panel (a new seed remounts the component with a new key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write-through: persist every change (including a seeded initial, which is
  // exactly how a cross-tool handoff replaces the previous draft).
  useEffect(() => {
    try {
      window.localStorage.setItem(
        formKey(name),
        JSON.stringify({ v: FORM_SCHEMA_VERSION, value })
      );
    } catch {
      /* over quota / unavailable — the draft just won't survive a refresh */
    }
  }, [name, value]);

  /** Drop the persisted draft (the in-memory value is left to the caller). */
  const clear = () => {
    try {
      window.localStorage.removeItem(formKey(name));
    } catch {
      /* unavailable storage — nothing to clear */
    }
  };

  return [value, setValue, clear];
}
