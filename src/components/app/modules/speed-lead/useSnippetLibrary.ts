"use client";

import { useEffect, useState } from "react";
import { coerceSnippets, DEFAULT_SNIPPETS, type Snippet } from "@/lib/speed-lead/snippets";

/** Per-project localStorage key for the editable snippet library. */
const snippetsKey = (projectId: string) => `app:speed-lead-snippets:${projectId}`;

/** Lazy initializer: read the per-project saved snippets once, guarding SSR and
 *  falling back to the built-in defaults on missing / corrupt storage. */
function loadSnippets(projectId: string): Snippet[] {
  if (typeof window === "undefined") return DEFAULT_SNIPPETS;
  try {
    const raw = window.localStorage.getItem(snippetsKey(projectId));
    if (!raw) return DEFAULT_SNIPPETS;
    return coerceSnippets(JSON.parse(raw));
  } catch {
    /* corrupt or unavailable storage — fall back to the defaults */
    return DEFAULT_SNIPPETS;
  }
}

/** Owns the per-project snippet library's localStorage lifecycle: the read-once
 *  lazy load (SSR-guarded) and seeding the per-project key when it is empty so
 *  the library is editable per workspace. Returns the in-memory list; expanding a
 *  snippet into the reply editor stays with the editor state in the shell.
 *  Client-only, no server imports. */
export function useSnippetLibrary(projectId: string): { snippets: Snippet[] } {
  /** Editable snippet library, read once per project from localStorage via a lazy
   *  initializer (SSR-guarded inside loadSnippets) — never read during a re-render
   *  or in an effect, matching the project's per-project persistence pattern. */
  const [snippets] = useState<Snippet[]>(() => loadSnippets(projectId));

  /** Seed the per-project key if it was empty so the library is editable per
   *  workspace. Writing to external storage in an effect is the supported use;
   *  the in-memory snippets came from the lazy initializer above. */
  useEffect(() => {
    try {
      if (window.localStorage.getItem(snippetsKey(projectId)) == null) {
        window.localStorage.setItem(snippetsKey(projectId), JSON.stringify(snippets));
      }
    } catch {
      /* storage unavailable — in-memory defaults still work */
    }
  }, [projectId, snippets]);

  return { snippets };
}
