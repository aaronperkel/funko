# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # next dev
npm run build        # next build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:watch

npm run db:generate  # drizzle-kit generate — emits SQL into drizzle/ after a schema.ts change
npm run db:migrate   # tsx scripts/migrate.ts — applies them (there is no `push` step)
npm run db:studio
npm run db:seed      # idempotent; keyed on (name, line)
```

Single test file / single case:

```bash
npx vitest run lib/pricing/refresh.test.ts
npx vitest run -t 'agrees for a figure that is'
```

Tests run under `DATABASE_URL=file::memory:` (set in `vitest.config.mts`) because `db/index.ts` builds its
client at module scope — importing anything that transitively touches the db needs a URL, and an in-memory
one means a test can never write to `local.db`.

## What this is

A single-user Funko Pop collection dashboard: catalogue, condition-aware valuation, weekly automated price
refresh, and a public read-only gallery. One admin, no user table — auth is a password and a signed cookie.
Local dev is a SQLite file; production is Turso. Same driver, same schema, same migrations; only
`DATABASE_URL` / `DATABASE_AUTH_TOKEN` differ.

## Architecture

### Money is integer cents, always

No float ever holds a currency value. `lib/money.ts` is the only place cents become a string and a string
becomes cents — `parseDollarsToCents` uses string arithmetic on purpose (`19.99 * 100` is
`1998.9999999999998`). It returns `null` for a cleared field and `undefined` for unparseable input, so
callers can distinguish the two.

### The valuation chain

This is the app's spine, and it is spread across four files that must agree:

1. `lib/condition.ts` — `effectiveTier(pop)` maps a figure's recorded condition onto one of three price
   tiers (`loose` / `damaged_box` / `new`, PriceCharting's "Out of Box" / "In Dmg Box" / "New Price").
   Ties break *downward*: this dashboard understates rather than flatters. Every valuation read path goes
   through this function. `hasProtector` never affects the tier.
2. `lib/valuation.ts` — `valuePop` turns a pop plus its latest stored snapshot into one number, at that
   figure's own tier. A manual appraisal beats any API outright.
3. `lib/pricing/registry.ts` — `resolveValueQuote` does the same job over *live provider quotes*.
   `VALUE_PRECEDENCE` is `['manual', 'pricecharting']`; `ebay_active` is deliberately absent from it.
4. `registry.test.ts` asserts (2) and (3) never disagree. Two implementations of "which number is the
   value" drifting apart is precisely the bug this app exists to avoid — keep that test passing.

Aggregates (`portfolioTotals`) compare value against the cost basis of *only the figures that have a
value*; including unpriced figures would report a loss that is really missing data.

### Pricing providers

`lib/pricing/provider.ts` defines the contract. Two invariants:

- **`fetchQuote` never throws.** A dead API returns `{ ok: false, retryable }`, which renders as "no data",
  not a 500. Use the shared `fetchJson` helper — it turns network failure, timeout, non-2xx, and non-JSON
  into typed results.
- **A quote carries all three tiers, never a blended "value."** Only the caller knows the figure's
  condition, so only the caller picks the tier.

`isConfigured()` gates each provider on its credentials so a deploy with no API keys shows "not configured"
rather than errors. **With zero keys the app must still be a working dashboard on manual values alone** —
don't introduce a hard dependency on any provider.

- `manual.ts` — your own appraisal, expressed as a provider. Always configured, highest precedence, and
  never written to `price_snapshots` (the value already lives on the pop row).
- `pricecharting.ts` — primary. Resolution order: cached product id → UPC (auto-accepted) → text search
  (goes to the review queue unpriced, for a human to confirm) → unmatched. Candidates must sit in a console
  starting with `funko`; the catalogue is shared with video games and names like "Mo", "Jay", "Falcon"
  collide. Serves **no history** — every chart point is one this app recorded itself.
- `ebay.ts` — optional secondary, **active listings only**. Asking prices, never sales. Every quote carries
  `askingPriceOnly: true`, snapshots land under `ebay_active`, and the query layer excludes that source from
  valuation. It must never become the value of anything.

### Refresh orchestration (`lib/pricing/refresh.ts`)

The weekly cron and the "refresh now" buttons run through the same code.

- **Resumable by query, not cursor.** Work is derived from "has no snapshot newer than N days", so a run
  that dies halfway self-heals next invocation. `cron_runs` is a pure log, never read as state.
- **One figure failing never stops a run** — each is wrapped and counted; the run ends `partial`.
- **Sequential with a delay.** Small collection, once a week; hammering a paid API is how tokens get revoked.
- `selectPopsToRefresh` is pure and separately tested — it decides whether the cron does useful work or
  burns quota. It skips sold figures, and skips figures parked in `pending_review`/`rejected` unless a UPC
  or confirmed id has since given the search a new answer.

Note `matchStatus` (pipeline state) is distinct from `needsDisambiguation` (a human note that a figure's
*name* is known to be ambiguous).

### The privacy boundary (`lib/queries/collection.ts`)

For a logged-out reader the private columns (purchase price, sold price, source, match plumbing) are **not
selected at all** — they never enter the result set, never reach a Server Component, never reach the RSC
payload. This is not UI-level hiding: cost basis must be absent from the bytes on the wire. `publicColumns`
/ `privateColumns` and the matching `PublicPop` / `PrivatePop` types are the contract; `toGalleryItem`
spreads private keys only when the entry actually carries them.

Public pages read the database directly through this query layer. They do not call the JSON API.

### Auth and route guarding

- `proxy.ts` at the repo root — Next 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`),
  and it runs on the Node runtime, so `jose` verification is the same code path as everywhere else.
- Session is a JWT in the `funko_session` cookie, signed with `AUTH_SECRET` — deliberately not derived from
  `ADMIN_PASSWORD`, so rotating the password isn't a silent mass logout.
- `ADMIN_API_PREFIXES` (`/api/pops`, `/api/upload`) are guarded on **every method**, not just mutations:
  they return whole pop rows including cost basis, so a mutation-only rule would leak via GET.
- `/api/cron/*` is exempt from the session guard and authenticates in-handler with a `CRON_SECRET` bearer
  token (Vercel Cron sends no cookies). With no secret configured the route refuses everything.
- `lib/auth.ts` (`next/headers`) is for Server Components and route handlers; `proxy.ts` must read cookies
  off the `NextRequest` instead.
- Password and secret comparisons go through `lib/password.ts` — both sides hashed, then `timingSafeEqual`.

### API and env conventions

- Route handlers: wrap in `withErrorHandling`, parse with `parseJsonBody(request, zodSchema)`, respond with
  `jsonOk` / `jsonError` (all `cache-control: no-store`). Input schemas live in `lib/validation.ts`; text
  fields normalise `""` → `null` rather than writing empty strings.
- Client components call `apiFetch` from `lib/client-api.ts`, which returns a typed result instead of
  throwing, so a failed request renders inline rather than tripping an error boundary.
- **Never read `process.env` at module scope.** `lib/env.ts` exposes lazy getters — required values throw at
  point of use, optional ones return `null` so providers can degrade. Eager reads would break `next build`
  whenever a secret is absent, which is exactly the case the providers are built to survive.

### UPCs

`lib/upc.ts` checksum-validates, it does not merely length-check. A wrong UPC doesn't fail loudly — it
resolves to *something else* in the catalogue and writes a confident, plausible, completely wrong price.
Normalisation also zero-pads to a standard GTIN length, because a CSV round-trip strips leading zeros and
the shortened result is still checksum-valid.
