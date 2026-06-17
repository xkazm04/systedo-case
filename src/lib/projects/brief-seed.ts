/** sessionStorage key bridging the keyword research module → the content brief
 *  module, so "Vytvořit brief" carries the chosen keywords across the route
 *  change (the two tools live in separate modules in the app shell). Per-project
 *  so seeds don't leak between projects in the same tab. */
export const briefSeedKey = (projectId: string) => `app:brief-seed:${projectId}`;
