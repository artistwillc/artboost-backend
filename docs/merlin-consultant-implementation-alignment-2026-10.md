# Merlin AI Consultant — implementation alignment (October 2026)

Source: ArtBoost Merlin AI Consultant Implementation Guide v1.0, October 2026.

## Preserve existing production architecture
- Extend `backend/routes/assistant.js` (authenticated `POST /assistant`) and the existing `consultantLaunchAuthority*.js` / `consultantPublishingActivity.js` services. Do not introduce a parallel unauthenticated `/api/consultant/chat` route or replace the current frontend integration.
- The consultant already has deterministic publishing and social-connection answers, artist-domain scope, and optional web research. Verify and extend these before adding new providers.
- Keep the website as the first acceptance-testing surface, then validate iOS and Android separately.

## Required corrections to the guide
1. **Never ship sample counts**: the document's `totalScheduled: 30`, `failedAttempts: 165`, and `skippedAttempts: 33` are illustrative, not account data. Every account-specific count must come from authenticated, scoped records and identify its time window.
2. **Enforce identity at the server boundary**: derive user ID from verified auth, not model arguments, request body, or a prompt. Filter all Supabase queries by authenticated user ID. Never send service-role credentials to clients.
3. **Do not assert `confidence: 'high'` unconditionally**. Distinguish verified, partial, unavailable, and general-knowledge answers. Missing data is not a count of zero.
4. **Use existing read-only operational tools**. Publishing outcomes must separate success, failure, skipped, and unverified; store connections and provider reachability are distinct.
5. **Keep web research server-side** with bounded tool use, rate limits, timeouts, source URLs, and injection-resistant handling of retrieved text. Never grant arbitrary URLs or outbound network access based on model text.
6. **Do not reintroduce the removed standalone Analytics feature**. Document only verified, supported platform/store capabilities; distinguish planned integrations from live ones.
7. **Preserve current account settings and app features**, including custom consultant names, support navigation, and established publishing-history behavior.
8. **No blanket expertise guarantee**. Merlin should provide sound guidance across art, photography, video, tattoo design, crafts, and hobbies, qualify uncertainty, and avoid claiming omniscience.

## Website-first acceptance criteria
- Authenticated user can ask “Did I have any failed posts today?” and “Do any of my automations have errors?”; responses match scoped database history, with correct timezone and status distinctions.
- No records, missing provider status, or failed query yield explicit unavailable/partial states, never invented successes or zeros.
- Connected-account answers agree with the Connections screen and do not conflate a token-health probe with disconnected status.
- Art, photography, videography, tattooing, and craft questions receive useful advice; current research uses attributable sources when available.
- Unauthenticated requests cannot retrieve account history. Cross-user leakage tests pass.
- Existing website, iOS, and Android assistant contracts remain compatible.

## Release gate
Do not merge or deploy consultant runtime changes until tests pass, website acceptance checks succeed, and native clients are verified. This file is a design and validation guide, not evidence that any runtime functionality was deployed.
