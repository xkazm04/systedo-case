"use client";

import { signIn, signOut, useSession } from "next-auth/react";

/** Google sign-in / sign-out control for the header. Shows the user's avatar +
 *  name when signed in, a "Přihlásit přes Google" button otherwise. */
export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <span className="h-8 w-20 animate-pulse rounded-pill bg-navy-50" aria-hidden />;
  }

  if (session?.user) {
    const { name, email, image } = session.user;
    return (
      <div className="flex items-center gap-2">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 rounded-full border border-line"
          />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
            {(name ?? email ?? "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <button
          type="button"
          onClick={() => signOut()}
          className="rounded-pill border border-line px-3 py-1.5 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
          title={email ?? undefined}
        >
          Odhlásit
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn("google")}
      className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
    >
      <GoogleGlyph />
      Přihlásit přes Google
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width={15} height={15} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.5-11.3-8.3l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C41.9 35.6 44 30.3 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
