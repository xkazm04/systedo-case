"use client";

/** The module's single data seam: every read and write of `/api/projects/[id]/crm/**`
 *  goes through here, so the queue, the table and the detail pane can never hold
 *  three different opinions about the same contact set.
 *
 *  Seeded from the server render (so the first paint needs no fetch) and refetched
 *  whenever the query changes. `live` is carried through untouched — on the sample
 *  set every write is refused up-front rather than posted and 404'd. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Contact, PipelineStage } from "@/lib/leads/types";

export interface LeadQuery {
  q: string;
  stage: PipelineStage | "";
  offset: number;
  limit: number;
}

export const DEFAULT_QUERY: LeadQuery = { q: "", stage: "", offset: 0, limit: 25 };

export interface LeadsApi {
  contacts: Contact[];
  live: boolean;
  /** contacts the project holds in total (unfiltered) */
  total: number;
  /** a full page came back, so there is at least one more. Derived rather than
   *  counted: the store has no cheap filtered COUNT, and a "1–25 of 900" that
   *  silently ignores the active filter is worse than no total at all. */
  hasNext: boolean;
  loading: boolean;
  error: string | null;
  query: LeadQuery;
  setQuery: (next: Partial<LeadQuery>) => void;
  refresh: () => Promise<void>;
  create: (input: Record<string, string>) => Promise<Contact | null>;
  patch: (contactId: string, body: Record<string, unknown>) => Promise<Contact | null>;
  erase: (contactId: string) => Promise<boolean>;
}

interface ListResponse {
  ok?: boolean;
  contacts?: Contact[];
  live?: boolean;
  total?: number;
  error?: string;
}

export function useLeads(
  projectId: string,
  initial: { contacts: Contact[]; live: boolean; total: number }
): LeadsApi {
  const [contacts, setContacts] = useState<Contact[]>(initial.contacts);
  const [live, setLive] = useState(initial.live);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQueryState] = useState<LeadQuery>(DEFAULT_QUERY);
  /** Skip the fetch the first effect run would otherwise fire over identical data. */
  const seeded = useRef(true);

  const base = `/api/projects/${encodeURIComponent(projectId)}/crm`;

  const load = useCallback(
    async (q: LeadQuery) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(q.limit),
          offset: String(q.offset),
        });
        if (q.q.trim()) params.set("q", q.q.trim());
        if (q.stage) params.set("stage", q.stage);
        const res = await fetch(`${base}/contacts?${params.toString()}`);
        const json = (await res.json()) as ListResponse;
        if (!res.ok || json.ok === false) throw new Error(json.error ?? "load-failed");
        setContacts(json.contacts ?? []);
        setLive(Boolean(json.live));
        setTotal(json.total ?? json.contacts?.length ?? 0);
      } catch {
        setError("load");
      } finally {
        setLoading(false);
      }
    },
    [base]
  );

  useEffect(() => {
    if (seeded.current) {
      seeded.current = false;
      return;
    }
    void load(query);
  }, [query, load]);

  const setQuery = useCallback((next: Partial<LeadQuery>) => {
    setQueryState((prev) => {
      // Any filter change resets paging — page 3 of the previous filter is a
      // guaranteed empty screen that reads as a bug.
      const resetsPaging = next.q !== undefined || next.stage !== undefined;
      return { ...prev, ...next, ...(resetsPaging && next.offset === undefined ? { offset: 0 } : {}) };
    });
  }, []);

  const refresh = useCallback(async () => {
    await load(query);
  }, [load, query]);

  const create = useCallback(
    async (input: Record<string, string>): Promise<Contact | null> => {
      try {
        const res = await fetch(`${base}/contacts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const json = (await res.json()) as { ok?: boolean; contact?: Contact };
        if (!res.ok || json.ok === false || !json.contact) return null;
        return json.contact;
      } catch {
        return null;
      }
    },
    [base]
  );

  const patch = useCallback(
    async (contactId: string, body: Record<string, unknown>): Promise<Contact | null> => {
      try {
        const res = await fetch(`${base}/contacts/${encodeURIComponent(contactId)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { ok?: boolean; contact?: Contact };
        if (!res.ok || json.ok === false || !json.contact) return null;
        setContacts((prev) => prev.map((c) => (c.id === contactId ? json.contact! : c)));
        return json.contact;
      } catch {
        return null;
      }
    },
    [base]
  );

  const erase = useCallback(
    async (contactId: string): Promise<boolean> => {
      try {
        const res = await fetch(`${base}/contacts/${encodeURIComponent(contactId)}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "gdpr-erasure" }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [base]
  );

  return {
    contacts,
    live,
    total,
    hasNext: contacts.length >= query.limit,
    loading,
    error,
    query,
    setQuery,
    refresh,
    create,
    patch,
    erase,
  };
}
