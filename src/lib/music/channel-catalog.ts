/** The curated music channel catalog (ADR-0016 §7, ADR-0017): where an
 *  independent track can live and be found, and what each place needs from the
 *  release. Catalog-as-data — one row per service, consumed by onboarding's
 *  research step, the metadata audit and the connect wizard — and the baseline
 *  that works with no CLI at all. Web research proposes additions and
 *  corrections; the operator accepts them; the catalog wins over a scan
 *  (zero-budget-channel-planning: grounding-precedence-catalog-over-scan).
 *
 *  HONESTY: every row carries `verifiedOn`. A row written from general knowledge
 *  and not yet checked against the service's current documentation says
 *  "unverified", and the UI says so. Costs and capabilities change; a row is a
 *  claim with a date, not a fact. Spotify is a distribution TARGET only — the
 *  app does not connect to it (ADR-0017, descoped 2026-10-13). */

export type MusicChannelFamily =
  | "distribution" // gets the track onto the stores, via a distributor
  | "streaming" // a store / streaming service the distributor delivers to
  | "video" // video platforms the artist uploads to directly
  | "direct-upload" // audio platforms the artist uploads to directly
  | "discovery" // identification, lyrics and metadata surfaces that make a track findable
  | "curation" // playlists and blogs that pick tracks
  | "community"; // places listeners talk

export type CostTier = "free" | "freemium" | "paid" | "revenue-share";

/** How the app can get numbers back (ADR-0017). `none` = a target, not a source. */
export type ConnectorMode = "api" | "import" | "manual" | "none";

export type MetadataField =
  | "isrc"
  | "upc"
  | "title"
  | "artists"
  | "credits"
  | "genre"
  | "subgenre"
  | "mood"
  | "language"
  | "explicit"
  | "releaseDate"
  | "artwork"
  | "lyrics"
  | "audioMaster";

export interface MusicChannel {
  id: string;
  name: string;
  family: MusicChannelFamily;
  cost: CostTier;
  connector: ConnectorMode;
  /** Metrics the connector can actually read, when it is `api`. */
  readable?: Array<"views" | "plays" | "likes" | "comments" | "followers" | "listeners">;
  /** What the release must carry for this place to accept or surface it. */
  requires: MetadataField[];
  /** Reached through a distributor rather than uploaded directly. */
  viaDistributor: boolean;
  url: string;
  /** One sentence: what this place does for an independent release. */
  why: string;
  /** "unverified" until checked against the service's current docs. */
  verifiedOn: string;
}

const CORE: MetadataField[] = ["title", "artists", "genre", "language", "explicit", "releaseDate", "artwork"];
const STORE: MetadataField[] = [...CORE, "isrc", "upc", "credits", "audioMaster"];

export const MUSIC_CHANNELS: readonly MusicChannel[] = [
  { id: "routenote", name: "RouteNote", family: "distribution", cost: "revenue-share", connector: "manual", requires: STORE, viaDistributor: false, url: "https://routenote.com", why: "A distributor with a free tier that takes a revenue share instead of a fee.", verifiedOn: "unverified" },
  { id: "distrokid", name: "DistroKid", family: "distribution", cost: "paid", connector: "manual", requires: STORE, viaDistributor: false, url: "https://distrokid.com", why: "A subscription distributor delivering to the major stores and short-video platforms.", verifiedOn: "unverified" },
  { id: "cdbaby", name: "CD Baby", family: "distribution", cost: "paid", connector: "manual", requires: STORE, viaDistributor: false, url: "https://cdbaby.com", why: "A per-release distributor with publishing administration on offer.", verifiedOn: "unverified" },
  { id: "spotify", name: "Spotify", family: "streaming", cost: "free", connector: "none", requires: [...STORE, "mood"], viaDistributor: true, url: "https://artists.spotify.com", why: "The largest streaming store; editorial pitching happens before release day.", verifiedOn: "unverified" },
  { id: "apple-music", name: "Apple Music", family: "streaming", cost: "free", connector: "manual", requires: [...STORE, "lyrics"], viaDistributor: true, url: "https://artists.apple.com", why: "A major store where time-synced lyrics improve how a track is presented.", verifiedOn: "unverified" },
  { id: "deezer", name: "Deezer", family: "streaming", cost: "free", connector: "api", readable: ["followers"], requires: STORE, viaDistributor: true, url: "https://www.deezer.com", why: "A store with a public API for artist fans and track rank.", verifiedOn: "unverified" },
  { id: "youtube", name: "YouTube", family: "video", cost: "free", connector: "api", readable: ["views", "likes", "comments"], requires: [...CORE, "credits"], viaDistributor: false, url: "https://www.youtube.com", why: "Upload a visualiser or video; views, likes and comments are readable through the Data API.", verifiedOn: "unverified" },
  { id: "soundcloud", name: "SoundCloud", family: "direct-upload", cost: "freemium", connector: "manual", requires: [...CORE, "credits"], viaDistributor: false, url: "https://soundcloud.com", why: "Direct upload with comments on the waveform; strong for early listeners and DJs.", verifiedOn: "unverified" },
  { id: "bandcamp", name: "Bandcamp", family: "direct-upload", cost: "revenue-share", connector: "manual", requires: [...CORE, "credits", "lyrics"], viaDistributor: false, url: "https://bandcamp.com", why: "Sell and stream directly to fans, with the artist keeping most of each sale.", verifiedOn: "unverified" },
  { id: "audius", name: "Audius", family: "direct-upload", cost: "free", connector: "api", readable: ["plays", "comments", "followers"], requires: CORE, viaDistributor: false, url: "https://audius.co", why: "Free direct upload with an open API for plays.", verifiedOn: "unverified" },
  { id: "lastfm", name: "Last.fm", family: "discovery", cost: "free", connector: "api", readable: ["listeners", "plays"], requires: ["title", "artists"], viaDistributor: false, url: "https://www.last.fm", why: "Scrobbles from many players add up to a cross-platform listener count.", verifiedOn: "unverified" },
  { id: "musicbrainz", name: "MusicBrainz", family: "discovery", cost: "free", connector: "none", requires: ["title", "artists", "isrc", "releaseDate", "credits"], viaDistributor: false, url: "https://musicbrainz.org", why: "The open music database many players and taggers read metadata from.", verifiedOn: "unverified" },
  { id: "musixmatch", name: "Musixmatch", family: "discovery", cost: "free", connector: "none", requires: ["title", "artists", "lyrics", "language"], viaDistributor: false, url: "https://www.musixmatch.com", why: "Lyrics submitted here can surface in streaming apps.", verifiedOn: "unverified" },
  { id: "genius", name: "Genius", family: "discovery", cost: "free", connector: "none", requires: ["title", "artists", "lyrics", "credits"], viaDistributor: false, url: "https://genius.com", why: "Verified-artist lyric pages and credits that search engines index.", verifiedOn: "unverified" },
  { id: "submithub", name: "SubmitHub", family: "curation", cost: "freemium", connector: "manual", requires: CORE, viaDistributor: false, url: "https://www.submithub.com", why: "Pitch to blogs and playlist curators, with free submissions alongside paid ones.", verifiedOn: "unverified" },
  { id: "reddit", name: "Reddit music communities", family: "community", cost: "free", connector: "manual", requires: ["title", "artists", "genre"], viaDistributor: false, url: "https://www.reddit.com", why: "Genre communities where sharing your own work is allowed under each one's rules.", verifiedOn: "unverified" },
];

export function musicChannel(id: string): MusicChannel | undefined {
  return MUSIC_CHANNELS.find((c) => c.id === id);
}

/** The metadata a set of chosen channels needs, with the channels that need each
 *  field — the input of the onboarding metadata audit. */
export function requiredMetadata(channelIds: readonly string[]): Map<MetadataField, string[]> {
  const out = new Map<MetadataField, string[]>();
  for (const id of channelIds) {
    const c = musicChannel(id);
    if (!c) continue;
    for (const f of c.requires) out.set(f, [...(out.get(f) ?? []), c.id]);
  }
  return out;
}
