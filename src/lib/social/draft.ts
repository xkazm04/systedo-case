/** Deterministic social-post + reply drafting — no AI, instant, platform-tailored.
 *  A believable first draft a marketer edits, generated from a topic + tone, so the
 *  command center works out of the box. (An LLM draft is a natural later upgrade.)
 *  Pure. */
import {
  PLATFORM_LIMITS,
  SOCIAL_PLATFORM_LABELS,
  type SocialMessage,
  type SocialPlatform,
  type Tone,
} from "./types";

function clamp(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}

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

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function hashtags(topic: string): string {
  const base = topic
    .toLowerCase()
    .replace(/[^a-z0-9á-ž ]/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => `#${w}`);
  return ["#mionelo", ...base, "#zdravě"].join(" ");
}

/** One draft caption per requested platform, tailored to its conventions. */
export function draftPosts(
  topic: string,
  tone: Tone,
  platforms: SocialPlatform[]
): { platform: SocialPlatform; content: string }[] {
  const t = topic.trim() || "naše novinky";
  const opener = TONE_OPENER[tone](t);
  const cta = TONE_CTA[tone];

  return platforms.map((platform) => {
    let content: string;
    if (platform === "linkedin") {
      content =
        `${opener}\n\n` +
        `V Mionelo se dlouhodobě věnujeme tématu „${t}". Přinášíme kvalitu, na kterou se zákazníci spolehnou, ` +
        `a sdílíme, co nás na téhle oblasti baví.\n\n${cta}`;
    } else if (platform === "instagram") {
      content = `${opener}\n\n${cap(t)} jak má být. ${cta}\n\n${hashtags(t)}`;
    } else {
      content = `${opener}\n\n${cap(t)} od Mionelo — ${cta}\n\n${hashtags(t)}`;
    }
    return { platform, content: clamp(content, PLATFORM_LIMITS[platform]) };
  });
}

/** A deterministic suggested reply for an inbound comment/DM. */
export function draftReply(message: SocialMessage): string {
  const name = message.author.split(" ")[0] || "díky";
  const lower = message.text.toLowerCase();
  const platform = SOCIAL_PLATFORM_LABELS[message.platform];

  if (/cena|kolik|stojí|sleva/.test(lower)) {
    return `Dobrý den ${name}, díky za zájem! Aktuální ceny i probíhající akce najdete na našem e-shopu mionelo.cz. Rádi poradíme s výběrem. 🙂`;
  }
  if (/dostupn|skladem|máte|kdy/.test(lower)) {
    return `Ahoj ${name}, díky za dotaz! Dostupnost vidíte vždy u produktu na mionelo.cz; pokud něco chybí, napište nám do DM a vyřešíme to.`;
  }
  if (/díky|super|skvěl|paráda|doporuč/.test(lower)) {
    return `Moc děkujeme, ${name}! 🙌 Vážíme si toho — a budeme se snažit držet laťku i dál.`;
  }
  return `Dobrý den ${name}, děkujeme za zprávu na ${platform}! Ozveme se co nejdříve s konkrétní odpovědí. 🙂`;
}
