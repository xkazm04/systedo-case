/** Deterministic social-post + reply drafting — no AI, instant, platform-tailored.
 *  A believable first draft a marketer edits, generated from a topic + tone, so the
 *  command center works out of the box. (An LLM draft is a natural later upgrade.)
 *  Pure. */
import { cap, clamp } from "@/lib/ai/tools/_shared";
import {
  PLATFORM_LIMITS,
  SOCIAL_PLATFORM_LABELS,
  type SocialMessage,
  type SocialPlatform,
  type Tone,
} from "./types";

const TONE_OPENER: Record<Tone, (t: string) => string> = {
  vecny: (t) => `${cap(t)}: co byste měli vědět.`,
  pratelsky: (t) => `Máte rádi ${t.toLowerCase()}? 🙌`,
  premiovy: (t) => `${cap(t)} v nejvyšší kvalitě.`,
  akcni: (t) => `🔥 ${cap(t)} — teď to nejlepší období!`,
};

const TONE_CTA: Record<Tone, string> = {
  vecny: "Více na našem e-shopu.",
  pratelsky: "Mrkněte k nám 👇",
  premiovy: "Objevte naši kolekci.",
  akcni: "Nakupte se slevou ještě dnes!",
};

/** Slugified brand hashtag + up-to-3 topic hashtags. No hardcoded brand — a
 *  caption must never sign off as someone else's company. */
function hashtags(topic: string, brand?: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9á-ž]/gi, "");
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9á-ž ]/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => `#${w}`);
  const brandTag = brand && slug(brand) ? [`#${slug(brand)}`] : [];
  return [...brandTag, ...base].join(" ") || "#novinky";
}

/** One draft caption per requested platform, tailored to its conventions. The
 *  optional `brand` is the active project's name — used so captions carry the
 *  user's OWN brand; absent, the copy stays brand-neutral (never a placeholder
 *  company). */
export function draftPosts(
  topic: string,
  tone: Tone,
  platforms: SocialPlatform[],
  brand?: string
): { platform: SocialPlatform; content: string }[] {
  const t = topic.trim() || "naše novinky";
  const opener = TONE_OPENER[tone](t);
  const cta = TONE_CTA[tone];
  const b = brand?.trim();

  return platforms.map((platform) => {
    let content: string;
    if (platform === "linkedin") {
      const lead = b
        ? `Ve značce ${b} se dlouhodobě věnujeme tématu „${t}".`
        : `Dlouhodobě se věnujeme tématu „${t}".`;
      content =
        `${opener}\n\n` +
        `${lead} Přinášíme kvalitu, na kterou se zákazníci spolehnou, ` +
        `a sdílíme, co nás na téhle oblasti baví.\n\n${cta}`;
    } else if (platform === "instagram") {
      content = `${opener}\n\n${cap(t)} jak má být. ${cta}\n\n${hashtags(t, b)}`;
    } else {
      content = `${opener}\n\n${cap(t)}${b ? ` od ${b}` : ""} — ${cta}\n\n${hashtags(t, b)}`;
    }
    return { platform, content: clamp(content, PLATFORM_LIMITS[platform]) };
  });
}

/** A deterministic suggested reply for an inbound comment/DM. `domain` is the
 *  project's own site (absent → a neutral "our site") — never a hardcoded one. */
export function draftReply(message: SocialMessage, domain?: string): string {
  // No first token (empty author) -> a neutral greeting, never a stray word the
  // sentence then reads as a name.
  const name = message.author.trim().split(/s+/)[0] ?? "";
  const hello = name ? `Dobrý den ${name}` : "Dobrý den";
  const lower = message.text.toLowerCase();
  const platform = SOCIAL_PLATFORM_LABELS[message.platform];
  const site = domain?.trim() || "našem webu";

  // Answer in the FIRST sentence; thanks may share it but must not push the answer
  // into the next (registry: answer-in-first-sentence-never-promise).
  if (/cena|kolik|stojí|sleva/.test(lower)) {
    return `${hello}, aktuální ceny i probíhající akce najdete na ${site} — díky za zájem! Rádi poradíme s výběrem. 🙂`;
  }
  if (/dostupn|skladem|máte|kdy/.test(lower)) {
    return `${hello}, dostupnost vidíte vždy u produktu na ${site} — díky za dotaz! Pokud něco chybí, napište nám do DM a vyřešíme to.`;
  }
  if (/díky|super|skvěl|paráda|doporuč/.test(lower)) {
    return `Moc děkujeme${name ? `, ${name}` : ""}! 🙌 Vážíme si toho — a budeme se snažit držet laťku i dál.`;
  }
  return `${hello}, děkujeme za zprávu na ${platform}! Ozveme se co nejdříve s konkrétní odpovědí. 🙂`;
}
