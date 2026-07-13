# Phase 1: LLM Observability — What Was Built and Why

This document explains the LLM observability layer in depth: the problem it
solves, every component, the design decisions and their tradeoffs, and how to
demo and defend it in an interview. Read it top to bottom once; after that,
the "Interview prep" section at the end is the quick refresher.

---

## 1. The problem

Before Phase 1, Speakzy's AI feature was a black box:

- An LLM call happened inside `ai.controller.js` with a raw `fetch`.
- The only visibility was `console.log` lines with hand-measured
  `performance.now()` timings — gone forever the moment the terminal scrolls.
- Nobody could answer basic operational questions:
  - How much is the AI feature costing per day?
  - How often does the primary model fail and the fallback kick in?
  - What percentage of requests are served from cache vs. a real model call?
  - Is latency getting worse? What is p95?
  - Did the last prompt change make output quality or shape worse?

Every production LLM feature needs answers to these questions. The industry
name for this is **LLM observability** — and it is the "Ops" in LLMOps.

---

## 2. What was built (component by component)

### 2.1 The choke point: `backend/src/lib/llm.js`

**The single most important design move.** Every chat-completion call in the
whole app now goes through one function:

```
completeJSON({ feature, model, prompt, schema, promptVersion, userId, fallbackUsed })
```

It owns, in order:

1. **The HTTP call** to OpenRouter (auth header, JSON response format,
   response-healing plugin).
2. **Error classification** — every failure mode gets a short machine-readable
   code instead of a free-text message:
   - `network_error` — fetch itself threw (DNS, timeout, no internet)
   - `http_401` / `http_429` / `http_500` ... — non-2xx from the provider
   - `empty_response` — 200 OK but no message content
   - `invalid_json` — content exists but is not parseable JSON
   - `schema_invalid` — parsed fine but failed the zod schema (wrong shape)
3. **Schema validation** — if the caller passes a zod schema, the parsed JSON
   is validated against it. Invalid output THROWS, which lets the caller's
   primary-to-fallback chain retry with another model. Valid output comes
   back *normalized* (zod fills defaults for optional fields).
4. **Logging** — exactly one `LlmCall` document per attempt, success or
   failure, with latency measured from just before the fetch.

Why a choke point matters: when Phase 4 adds the grammar tutor, that feature
gets observability, error taxonomy, and schema validation *for free* by
calling the same function. And tests have one seam to mock instead of five.

### 2.2 The data: `backend/src/models/LlmCall.js`

One MongoDB document per LLM interaction:

| Field | Meaning | Example |
|---|---|---|
| `feature` | Which product feature made the call | `"flashcards"` |
| `userId` | Who triggered it (ObjectId, optional) | — |
| `model` | Model id, or `"(cache)"` for cache hits | `"openai/gpt-4o-mini"` |
| `promptVersion` | Version tag of the prompt template | `"v1"` |
| `latencyMs` | Wall-clock time of the attempt | `1834` |
| `promptTokens` / `completionTokens` | From the provider's `usage` field | `412 / 288` |
| `costUsd` | Estimated cost (static price table) | `0.000234` |
| `fallbackUsed` | Was this the fallback model attempt? | `false` |
| `cacheHit` | Served from DB cache, no model call | `false` |
| `success` | Did the attempt produce valid output? | `true` |
| `errorType` | Classification code when success=false | `"http_500"` |
| `meta` | Free-form extras (used by Phase 2) | — |
| `createdAt` | Timestamp, **TTL-indexed: auto-deleted after 90 days** | — |

### 2.3 Fire-and-forget logging

`logLlmCall()` calls `LlmCall.create(...)` and only attaches a `.catch` that
prints a console error. It is **never awaited**.

This is deliberate: observability is a side effect, and a side effect must
never break or slow down the user's request. If MongoDB hiccups, the user
still gets flashcards; we lose one log row. There is a test that proves this:
`LlmCall.create` is mocked to reject, and the flashcards response is still 200.

The tradeoff: a fire-and-forget insert can land a few milliseconds "late"
(e.g., after a test's cleanup ran). The test suite handles this by asserting
on uniquely-identifiable documents rather than global counts — see the
comments in `flashcards.test.js`.

### 2.4 Cache hits are recorded too

When `GET /api/ai/flashcards` serves today's cached set from the user
document, no model is called — but we still write an `LlmCall` with
`model: "(cache)", cacheHit: true`.

Why: the question "what fraction of flashcard requests did the cache absorb?"
should be answerable from ONE collection with ONE aggregation. If cache hits
were invisible, the cache-hit rate would need a join against request logs
that don't exist. The `(cache)` pseudo-model keeps them from being confused
with real model calls in per-model stats.

### 2.5 Prompt versioning

`PROMPT_VERSION` is exported next to `buildPrompt()` in `ai.controller.js`
and stamped onto every logged call. The rule: **any change to the prompt
template bumps the version.**

This is what makes prompt changes *accountable*. In Phase 3, the eval suite
stores quality baselines per version; when v2 ships, its scores are compared
against v1's. Without version stamps, "did the new prompt make things worse?"
is unanswerable — you cannot group historical calls by the prompt that
produced them.

### 2.6 The dashboard: `GET /api/admin/llm-stats` + `/admin` page

A single aggregation (one `$facet` with three parallel pipelines) computes:

- **totals** — calls, estimated cost, cache hits, failures, fallbacks
- **byFeatureModel** — per (feature, model): call count, success rate, average
  latency, **p50/p95 latency**, token totals, cost
- **daily** — last 14 days of volume, failures, and spend

The React page at `/admin` renders four stat tiles and two tables. Access is
enforced **server-side** by `admin.middleware.js`: the logged-in user's email
must appear in the `ADMIN_EMAILS` env var (comma-separated, case-insensitive).
The frontend has no admin logic at all — it just renders what the API allows
and shows a friendly wall on 403.

### 2.7 Latency percentiles — and why they're computed in JS

Averages lie: one 30-second timeout hidden among fast calls barely moves the
mean but ruins real users' experience. **p50** (median: half of calls are
faster) and **p95** (19 of 20 calls are faster; the "bad day" number) are the
standard way to see the true latency distribution.

MongoDB 7 has a native `$percentile` accumulator, but this project computes
percentiles in JavaScript after `$push`-ing each group's latencies. Reason:
the aggregation must run identically on the CI container, a developer's local
MongoDB (possibly v6), and Atlas. At this project's volume (LlmCall is
TTL-capped at 90 days) the arrays are tiny; the code comments note that at
real scale this moves to `$percentile` or `$setWindowFields`. Knowing where
your implementation stops scaling — and saying so in a comment — is itself a
senior habit worth demonstrating.

---

## 3. Request walkthroughs (what actually happens)

### A. Fresh generation (no cache)

```
GET /api/ai/flashcards
  -> protectRoute attaches req.user
  -> no cached set for today
  -> generateAndSaveNewSet -> generateFlashcards
       -> completeJSON(model=gpt-4o-mini, schema=flashcardSetSchema)
            fetch OpenRouter -> 200, valid JSON, schema passes
            logLlmCall({ success: true, tokens, costUsd, promptVersion })  [not awaited]
       <- validated, normalized flashcards
  -> save to user.flashcardUsage, respond 200
Result: 1 LlmCall doc (success)
```

### B. Cache hit

```
GET /api/ai/flashcards
  -> cached cards exist for today
  -> logLlmCall({ model: "(cache)", cacheHit: true, success: true })  [not awaited]
  -> respond 200 with cached cards
Result: 1 LlmCall doc (cache pseudo-call), zero model cost
```

### C. Primary fails, fallback saves the request

```
completeJSON(gpt-4o-mini) -> OpenRouter 500
  logLlmCall({ success: false, errorType: "http_500", fallbackUsed: false })
  throws
generateFlashcards catches -> completeJSON(gemini-2.5-flash, fallbackUsed: true)
  -> success
  logLlmCall({ success: true, fallbackUsed: true })
Result: 2 LlmCall docs — one failed primary, one successful fallback.
The dashboard's "fallback rate" comes straight from this.
```

### D. Model returns garbage (the subtle one)

```
completeJSON(gpt-4o-mini) -> 200 OK, parseable JSON, but a card is missing targetWord
  zod schema fails -> logLlmCall({ success: false, errorType: "schema_invalid" })
  throws -> fallback chain retries with the other model
```

Without schema validation this malformed card would have reached the UI and
rendered a blank flashcard. "Never trust LLM output shape" is the guardrail
lesson of this phase.

---

## 4. Design decisions and their tradeoffs (interview gold)

| Decision | Alternative rejected | Why |
|---|---|---|
| One choke point (`lib/llm.js`) | Log at each call site | New features inherit observability for free; one seam for tests; impossible to "forget" logging |
| Fire-and-forget logging | `await` the insert | User latency and reliability must not depend on the logging path |
| Record cache hits as pseudo-calls | Only log real model calls | Cache-hit rate becomes a one-collection aggregation; `(cache)` label keeps per-model stats clean |
| Static price table for cost | Query provider billing APIs | Good-enough estimates, zero extra calls, zero coupling; clearly labeled as estimates |
| Error taxonomy (short codes) | Store raw error messages | Codes are groupable in aggregations ("how many http_429 this week?"); messages aren't |
| JS percentiles after `$push` | Mongo `$percentile` | Runs on Mongo 6+ everywhere (CI, local, Atlas); documented as the thing to change at scale |
| 90-day TTL on LlmCall | Keep forever | Observability data, not user data; bounded storage on a free tier; TTL index = zero-maintenance cleanup |
| `ADMIN_EMAILS` env allowlist | `isAdmin` field on User | No admin-promotion attack surface in the DB or API; ops-controlled; trivially auditable. Tradeoff: needs a restart to change (acceptable at this scale) |
| Prompt version as a logged string | Git history "knows" | Git knows what the prompt *is*; only a per-call stamp knows which version *produced this specific output* |

---

## 5. File map

```
backend/src/lib/llm.js                  completeJSON + logLlmCall + price table
backend/src/models/LlmCall.js           schema + 90-day TTL index
backend/src/middleware/admin.middleware.js  ADMIN_EMAILS allowlist gate
backend/src/controllers/admin.controller.js $facet aggregation + JS percentiles
backend/src/routes/admin.route.js       GET /api/admin/llm-stats
backend/src/controllers/ai.controller.js    PROMPT_VERSION, cache-hit logging,
                                             generateFlashcards via completeJSON
frontend/src/pages/AdminStatsPage.jsx   /admin dashboard (tiles + tables)
frontend/src/lib/api.js                 getLlmStats()
backend/src/test/flashcards.test.js     observability behavior tests
backend/src/test/llmStats.test.js       admin endpoint tests (401/403/200)
```

---

## 6. How to demo it (2 minutes)

1. Log in with an account whose email is in `ADMIN_EMAILS`; open `/admin`.
2. Open the home page in another tab -> generate a flashcard set ("Next
   Lesson") -> refresh `/admin`: a real model call appears with latency,
   tokens, and cost.
3. Reload the home page -> refresh `/admin`: a `(cache)` row appears and the
   cache-hit rate moves.
4. Point at the p95 column: "one aggregation, no external APM vendor."
5. Mention: every row auto-expires after 90 days (TTL index), and if the
   logging DB write ever fails, users still get their flashcards — there's a
   test for that.

---

## 7. Interview prep — likely questions, honest answers

**"Why didn't you use LangSmith / Langfuse / an APM vendor?"**
The homegrown version is ~150 lines, teaches exactly what those tools do
under the hood, has zero vendor coupling, and lives in the same MongoDB I
already run. For a team product I would evaluate Langfuse (self-hosted) —
but I can explain every line of this one.

**"Why estimate cost instead of using real billing data?"**
Billing APIs lag and add a dependency. Token counts come back on every
response; multiplying by a price table is accurate to within rounding and
available instantly. The dashboard labels it "estimated".

**"What happens if two requests race?"** / **"Is logging transactional?"**
Logging is deliberately non-transactional and lossy-by-design: an
observability row is worth less than a millisecond of user latency. Missing
one row in a crash is acceptable; blocking a user because logging is slow is
not.

**"How would this scale?"**
Three known cliffs, all documented in code comments: (1) JS percentiles ->
`$percentile` at higher volume; (2) fire-and-forget single inserts -> batched
writes or a queue; (3) the 14-day daily facet -> a pre-aggregated daily
rollup collection. Naming your scaling cliffs before being asked is the move.

**"Why version prompts?"**
Because prompt changes are deploys. If quality drops on Tuesday, I need to
know which prompt version produced Tuesday's outputs. It also enables Phase
3's regression evals: score v2 against v1's stored baseline before trusting it.

**"What was the hardest bug?"**
A test flake: fire-and-forget inserts sometimes landed *after* the test
cleanup that runs between tests, polluting the next test's counts. Fix:
assert on uniquely-identifiable documents (unique token counts, distinct
user ids) instead of global counts. It's a tiny lesson in why async side
effects and shared state don't mix.

---

## 8. Verification record

- 43/43 backend tests green, including 9 new observability/admin tests.
- Frontend builds and lints clean.
- Live-verified in the dev environment: real generation rows, `(cache)` rows,
  and the admin gate (403 for non-admins, 200 for `ADMIN_EMAILS` members).
- Full gate checklist and accepted gaps: see AI_ROADMAP.md, "Verification
  Gate 1".
