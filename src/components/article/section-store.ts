/** Tiny pub/sub bridge between the in-article heading permalink buttons
 *  (HeadingAnchor) and the sticky ArticleToc. When a reader copies a section's
 *  permalink, the heading "announces" its id here and the TOC slides its
 *  active-section highlight to match — so the copy action and the
 *  reading-position indicator stay in sync without threading state through the
 *  server-rendered page that sits between the two client islands. */
type Listener = (id: string) => void;

const listeners = new Set<Listener>();

/** Notify subscribers that the section with this id was just permalinked. */
export function announceSection(id: string): void {
  for (const listener of listeners) listener(id);
}

/** Subscribe to permalink announcements; returns an unsubscribe function. */
export function subscribeSection(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
