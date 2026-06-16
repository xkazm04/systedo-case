/** Server-side locale resolution. The chosen locale lives in a cookie so both
 *  server components and the client provider read the same source of truth.
 *  Server-only (uses next/headers). */
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/lib/format";
import { LOCALE_COOKIE } from "./messages";

function isLocale(v: string | undefined): v is SupportedLocale {
  return v === "cs" || v === "en";
}

/** The active locale from the cookie, defaulting to cs. */
export async function getServerLocale(): Promise<SupportedLocale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
