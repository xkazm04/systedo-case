/** Canonical project-name resolver for anything that becomes public-looking
 *  content — an AI-drafted review reply, a social caption, a signature. A demo
 *  or sample project may be named "Dentalis (demo)" / "Klinika (ukázka)", and a
 *  reply written on behalf of "Dentalis (demo)" reads as a test account (UAT
 *  finding L1-19). Strip the parenthetical demo/ukázka marker (and any trailing
 *  whitespace) so the name fed to a prompt — and shown above the reply — is the
 *  clean brand only. Defined once here; every name→prompt boundary calls it. */
export function promptSafeName(name: string | undefined | null): string {
  if (!name) return "";
  return name.replace(/\s*\((?:demo|ukázka|sample)\)\s*$/i, "").trim();
}
