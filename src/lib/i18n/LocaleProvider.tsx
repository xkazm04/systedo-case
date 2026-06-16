"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupportedLocale } from "@/lib/format";
import { getMessages, LOCALE_COOKIE, type Messages } from "./messages";

interface LocaleContextValue {
  locale: SupportedLocale;
  messages: Messages;
  setLocale: (locale: SupportedLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Holds the active locale client-side, seeded from the server-read cookie so
 *  there is no hydration mismatch. Switching writes the cookie and refreshes the
 *  route so server components re-render in the new locale too. */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLocale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<SupportedLocale>(initialLocale);

  const setLocale = useCallback(
    (next: SupportedLocale) => {
      setLocaleState(next);
      // 1 year, root path — read back by getServerLocale on the next request.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      router.refresh();
    },
    [router]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, messages: getMessages(locale), setLocale }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

/** Active locale + setter for client components. */
export function useLocale(): LocaleContextValue {
  return useLocaleContext();
}

/** Just the message dictionary for the active locale. */
export function useMessages(): Messages {
  return useLocaleContext().messages;
}
