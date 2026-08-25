---
name: Bug report
about: Something is broken. Tell us where it runs, what doctor says, and how to reproduce it.
title: ""
labels: bug
assignees: ""
---

<!--
Adamant is maintained by one person plus agents; issues are triaged weekly.
A report with the three sections below filled in usually gets fixed in one pass;
one without them usually gets a round-trip of questions first.

Security issues: do NOT open a public issue — see SECURITY.md.
-->

## Deploy mode

<!-- Pick one. Note: a self-hosted *production* mode does not exist yet — if you
     are running `next start` against real credentials, say so, but expect the
     answer to involve the hosted product or the local dev path. -->

- [ ] Local dev (`npm run dev:local` — DEV_AUTH + LOCAL_DB, fully offline)
- [ ] Cloud-connected dev (`npm run dev` — Google OAuth + Firestore)
- [ ] Hosted product

## `npm run doctor` output

<!-- Paste the full output. It prints what your .env.local actually switches on
     and is usually half the diagnosis. Redact any values it echoes that you
     consider secret; keep the ON/OFF lines. Skip only for the hosted product. -->

```text

```

## Reproduction

<!-- Numbered steps from a fresh `npm run seed:local` (or a fresh hosted
     project) to the broken behaviour. What you expected, what happened instead.
     Screenshots or console/server output welcome. -->

1.

**Expected:**

**Actual:**
