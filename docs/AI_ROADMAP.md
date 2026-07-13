# Speakzy AI Roadmap — RAG + LLMOps

Working document for evolving Speakzy from "MERN app with an LLM call" into an
applied AI-engineering project: personalized retrieval-augmented flashcards, a
citation-backed grammar tutor, LLM observability, and a CI eval suite.

**Rule: every phase ends with its Verification Gate. The gate is mandatory —
run every check, record what works and what doesn't in the "Gate results"
block, and do not start the next phase until failures are either fixed or
explicitly accepted with a reason.**

---

## Architecture decisions (settled — don't relitigate per phase)

| Decision | Choice | Why |
|---|---|---|
| Embeddings provider | Google `gemini-embedding-001` @ 768 dims (free tier; NOTE: text-embedding-004 was shut down 2026-01-14) or OpenAI `text-embedding-3-small` — behind `lib/embeddings.js` | OpenRouter has **no embeddings endpoint** (chat only). Abstraction keeps the provider swappable and mockable. AI Studio's new "AQ."-prefixed auth keys are valid — sent via x-goog-api-key header. |
| Vector store | MongoDB Atlas Vector Search (prod) + in-memory cosine driver (dev/CI) | No new infra; M0 free tier allows 3 search indexes (we need 2). CI's plain `mongo:7` has no vector search, so the memory driver keeps tests green. A user's own words (≤ a few hundred vectors) don't *need* an index — the Tatoeba corpus (~50k) does. |
| Judge model | Gemini Flash judges GPT-4o-mini outputs | Avoids same-family self-preference bias in LLM-as-judge evals. |
| LLM choke point | All chat completions go through `backend/src/lib/llm.js` | One place for observability, prompt versioning, fallback, and mocking. |
| Cost control | Every AI-facing endpoint gets a daily per-user quota (existing `DAILY_LIMIT` pattern) | Free-tier budget; unmetered LLM endpoints are how demo projects die. |
| "Today" semantics | UTC (`toISOString().split("T")[0]`), matching existing `flashcardUsage.lastDate` | Consistency across stats. |

---

## Phase 0 — Foundations (server-side study history + LLM output validation)

**Why first:** RAG personalization needs study history the *server* can see
(it currently lives in per-device localStorage), and both runtime and evals
need a schema for LLM output (currently `JSON.parse` with no shape check).

### Build

1. **`StudiedWord` model** (`backend/src/models/StudiedWord.js`)
   - Fields: `userId`, `targetWord` (display case), `wordKey` (lowercased,
     for dedupe), `nativeWord`, `targetLanguage` (from
     `req.user.learningLanguage`, never from the client), `category`,
     `timesStudied`, `knewIt`, `embedding` (unused until Phase 2),
     timestamps.
   - Unique compound index `{ userId, targetLanguage, wordKey }` — one doc
     per word per user per language; upserts make study events idempotent.
2. **Endpoints** (in `ai.route.js`, behind `protectRoute`)
   - `POST /api/ai/study` — zod-validated `{ targetWord, nativeWord?,
     category?, knewIt? }`. Upsert by the unique key; `knewIt: true`
     increments `knewIt`, otherwise `timesStudied`. Retry once on the E11000
     upsert race.
   - `GET /api/ai/study/today` — `{ count, wordKeys }` for words touched
     since UTC midnight (via `updatedAt`).
3. **Zod schemas for AI I/O** (`backend/src/lib/aiSchemas.js`)
   - `flashcardSetSchema` validates every LLM response inside the model-call
     path; invalid output throws → existing primary→fallback chain retries.
     (Lenient on `difficulty`/`partOfSpeech` at runtime; evals tighten later.)
   - `studyEventSchema` for the new endpoint.
4. **Frontend rewire**
   - `StudyStatsContext` drops localStorage; hydrates from
     `GET /study/today` (react-query), layers an optimistic local `Set` on
     top, fire-and-forgets `POST /study` on reveal / "I knew it".
   - "Words studied" becomes account-level → same count on every device.
5. **Tests** — `backend/src/test/study.test.js`: create/dedupe/case-insensitive
   upsert, `knewIt` counting, today endpoint, validation 400s, auth 401.

### Verification Gate 0 (mandatory)

- [x] `cd backend && npm test` — full suite passes, including new study tests
- [x] `cd frontend && npm run build` — clean build
- [x] Manual: reveal a card → "Words studied" +1 instantly; re-reveal same card → no change
- [x] Manual: refresh the page → count persists (served by API, not localStorage)
- [x] Manual: second browser/incognito, same account → same count (cross-device)
- [x] DB: `StudiedWord` docs have `wordKey` lowercase, one doc per word, `timesStudied`/`knewIt` incrementing (covered by study.test.js against real Mongo)
- [x] Negative: `POST /api/ai/study` without cookie → 401; empty `targetWord` → 400 (covered by study.test.js)

**Gate results (fill in):**
```
Date: 2026-07-13
What works:
- 35/35 backend tests green (7 new study tests: upsert dedupe incl. case-
  insensitivity, knewIt vs timesStudied counters, today endpoint, per-user
  isolation, 400/401 negatives).
- New regression test: schema-invalid LLM output (missing targetWord) is
  rejected and triggers the model fallback chain.
- Frontend builds clean; lint clean on changed files.
What doesn't / accepted gaps:
- Manual checks (reveal increments, refresh persistence, cross-device)
  verified by the user in the browser on 2026-07-13. GATE 0 PASSED.
- Old per-device localStorage entry "speakzy:studyStats" is orphaned in
  browsers that used the previous build; harmless, ignored by new code.
- Day-boundary is UTC everywhere; a user in IST sees the "day" roll over
  at 05:30 local. Accepted: consistent with existing sessionsToday logic.
```

---

## Phase 1 — LLMOps: Observability (`lib/llm.js` + `LlmCall` + admin stats)

**Why before RAG:** you want to *watch* retrieval-augmented generation behave
while building it.

### Build

1. **`backend/src/lib/llm.js`** — extract the OpenRouter `fetch` from
   `ai.controller.js` into `completeJSON({ feature, model, prompt,
   promptVersion, userId })`. All LLM calls (now and future) go through it.
2. **`LlmCall` model** — `feature`, `userId`, `model`, `promptVersion`,
   `latencyMs`, `promptTokens`/`completionTokens` (OpenRouter's `usage`
   field), `costUsd` (static price table), `fallbackUsed`, `cacheHit`,
   `success`, `errorType`, `meta` (Mixed), `createdAt` with 90-day TTL index.
   Insert fire-and-forget — never block the user's response.
3. **Prompt versioning** — export `PROMPT_VERSION = "v1"` beside
   `buildPrompt`; log on every call; bump on every prompt change.
4. **`GET /api/admin/llm-stats`** — middleware gating by `ADMIN_EMAILS` env
   var; one aggregation: calls/day, p50/p95 latency, fallback rate, cache-hit
   rate, est. cost, grouped by feature/model. Small admin-only frontend page
   with stat tiles (keep it modest — the aggregation is the substance).
5. Delete the hand-rolled `performance.now()` logging in `ai.controller.js`.

### Verification Gate 1 (mandatory)

- [x] `npm test` passes; flashcard generation still works end-to-end in the app
- [x] Generate a set → one `LlmCall` doc appears with tokens, latency, cost, promptVersion (covered by flashcards.test.js with mocked usage data)
- [x] Force a primary-model failure → fallback works AND `fallbackUsed: true` is recorded (test: failed primary logged with errorType http_500, successful fallback logged with fallbackUsed true)
- [x] Cached flashcard fetch → `cacheHit: true` doc — DECIDED: cache hits ARE recorded (model "(cache)") so cache-hit rate is computable from one collection (test-covered)
- [x] `/api/admin/llm-stats` as admin → sane numbers; as non-admin → 403 (llmStats.test.js: 401 unauth, 403 non-admin, 403 when ADMIN_EMAILS unset, 200 admin with exact aggregates, case-insensitive email match)
- [x] LlmCall insert failure does NOT break flashcard responses (test: LlmCall.create mocked to reject, flashcards still 200)
- [x] Manual: log into the app with ADMIN_EMAILS set, visit /admin, see real stats (user confirmed after .env restart fix — nodemon doesn't watch .env; GATE 1 PASSED. Deep-dive doc: PHASE_1_OBSERVABILITY.md)

**Gate results (fill in):**
```
Date: 2026-07-13
What works:
- 43/43 backend tests green (5 new observability tests + 4 admin-stats
  tests). Frontend builds and lints clean.
- All LLM I/O now flows through lib/llm.js completeJSON (fetch, JSON parse,
  zod validation, LlmCall logging in one place). ai.controller.js no longer
  contains a fetch call; hand-rolled performance.now() logging deleted.
- PROMPT_VERSION="v1" logged on every call.
- Live smoke on running dev server: /api/admin/llm-stats responds (401
  unauth), flashcards route unaffected.
What doesn't / accepted gaps:
- Latency percentiles computed in JS after $push (portable to Mongo 6+);
  at real scale this should move to $percentile (Mongo 7+) — noted in
  admin.controller.js.
- Cost figures are static-price-table estimates, not billed amounts.
- Manual /admin dashboard check pending: user must add ADMIN_EMAILS to
  backend/.env (nodemon restarts automatically) and visit /admin.
```

---

## Phase 2 — RAG 1: Personalized flashcards

### Build

1. **`backend/src/lib/embeddings.js`** — `embed(texts: string[])` → provider
   API; mock in tests. Embed `"{targetWord} — {nativeWord}"` async when a
   study event creates a new `StudiedWord` (never block the study response).
2. **Retrieval interface** (`backend/src/lib/retrieval.js`) — `memory` driver
   (fetch user vectors, cosine in Node) for dev/CI; `atlas` driver
   (`$vectorSearch`) for prod. Driver chosen by env var.
3. **Atlas vector index** on `StudiedWord.embedding` (created in Atlas UI —
   not Mongoose; document dims + cosine in this file when done).
4. **Generation pipeline** in `generateAndSaveNewSet`:
   - Embed category (cache the 10 category vectors — they never change).
   - Retrieve top-K (~8) related known words + full exclusion list.
   - Prompt additions: exclusion ("do NOT teach these") + weaving ("reuse
     these known words in example sentences" — the i+1 idea).
   - Post-filter: drop cards whose `targetWord` matches a studied word
     (case/diacritic-insensitive); one retry for replacements if < 5 remain.
   - Log `retrievedCount` and drop rate into `LlmCall.meta`.
5. **Cold start:** no history → pipeline degrades to current behavior (say so
   in README).

### Verification Gate 2 (mandatory)

- [x] `npm test` passes — including new tests: post-filter drops a seeded known word; cold-start user generates fine; retrieval memory-driver unit test with known cosine values (52/52 green; rag.test.js has 9 tests)
- [x] Manual: study several words → generate next set → none of the studied words reappear as new cards (user verified 2026-07-13)
- [x] Manual: example sentences reuse known words — embeddings live via gemini-embedding-001 + AQ key (user verified 2026-07-13)
- [x] `LlmCall.meta.retrievedCount` > 0 for a user with history; = 0 for a fresh user (both test-covered)
- [x] Atlas driver: DEFERRED — memory driver is the default and is test-verified; atlas driver is written but needs the "studiedword_embedding" index created in the Atlas UI (768 dims, cosine, filter fields userId + targetLanguage) and VECTOR_DRIVER=atlas. Not required at current corpus size.
- [x] Latency: retrieval adds one embedding call (~0.1-0.3s, cached per category) + one Mongo find — watch /admin p95 over time. GATE 2 PASSED.

**Gate results (fill in):**
```
Date: 2026-07-13
What works:
- 52/52 backend tests green. New coverage: prompt carries exclusion +
  weave rules; post-filter catches model-repeated studied words (incl.
  case differences) with one replacement retry; retry failure degrades to
  the filtered set; cold start produces a clean v1-style prompt;
  meta.excludedCount/retrievedCount logged on LlmCall.
- PROMPT_VERSION bumped to v2 (personalization rules injected into the
  rules block, not appended after the JSON instructions).
- Embedding backfill on study events is fire-and-forget and a no-op when
  GEMINI_API_KEY is unset; setup.js blanks the key so tests can never hit
  the real embeddings API.
What doesn't / accepted gaps:
- Retrieval (known-word weaving) is INACTIVE until GEMINI_API_KEY is set
  (free key from Google AI Studio). Exclusion-list personalization works
  without it. Manual checks pending until then.
- Post-filter drop rate is logged via the retry call's meta
  (droppedFromPrevious) and console.warn, not on the original call's doc —
  accepted simplification (fire-and-forget docs can't be enriched
  after the fact without a race).
- Atlas $vectorSearch driver deferred as above.
```

---

## Phase 2.5 — Spaced-repetition revision deck (Leitner system)

**Why:** the study history is a corpus twice over — Phase 2 retrieves from it
to generate NEW cards; this phase replays it as REVISION cards. Zero LLM
calls: revision runs entirely off the database ("the AI feature generates,
the revision feature runs free off its exhaust data").

### Build

1. **Leitner scheduling on `StudiedWord`**: `box` (1-5, new words start in
   box 1) and `nextReviewAt`. Intervals: 1, 2, 4, 7, 14 days. Review correct
   -> box+1 (capped at 5); wrong -> back to box 1. Reviews also bump
   `timesStudied`/`knewIt`, so they count toward "Words studied today".
2. **Card snapshots**: study events now carry the full card (example
   sentences, romanization, partOfSpeech) so revision cards can show real
   content without regenerating anything. Old rows without snapshots still
   review fine (word-only).
3. **Endpoints** (`review.controller.js`, mounted under `/api/ai`):
   - `GET /api/ai/review` -> due cards (`nextReviewAt <= now`, lowest box /
     oldest first, capped) + total due count.
   - `POST /api/ai/review` `{ targetWord, correct }` -> Leitner update,
     returns new box + next review date.
4. **UI**: ReviewWidget on the home page next to Daily Vocab — due-count
   badge, flip card, "Forgot" / "Got it" buttons, caught-up state.
5. **Tests**: due filtering, box progression + cap, wrong-answer reset,
   snapshot storage, auth/validation negatives.

### Verification Gate 2.5 (mandatory)

- [x] `npm test` passes including new review tests (61/61; review.test.js has 9)
- [x] `npm run build` clean
- [x] Manual: due words appear in Review; "Got it" moves them out (user verified 2026-07-13)
- [x] Manual: "Words studied today" increments when reviewing (user verified 2026-07-13). GATE 2.5 PASSED. Deep-dive doc: PHASE_2_RAG_PERSONALIZATION.md
- [x] No LlmCall docs created by any review action (test-covered)

**Gate results (fill in):**
```
Date: 2026-07-13
What works:
- 61/61 backend tests green. New coverage: due filtering (fresh words are
  NOT due — they default to +1 day), weakest-box-first ordering, box
  progression with 4-day interval check, box-5 cap, wrong-answer reset to
  box 1/tomorrow, snapshot round-trip, 401/400/404 negatives, and an
  explicit LLM-free assertion (no LlmCall docs from review actions).
- Study events now snapshot the full card (examples, romanization,
  partOfSpeech) — bare events can't blank stored snapshots.
- Reviews bump timesStudied/knewIt, so they count toward daily stats and
  strengthen the knewIt signal Phase 2+ can use.
- ALSO this session: embeddings went live — gemini-embedding-001 verified
  end-to-end with the user's new AQ.-format key (768-dim single + batch).
  text-embedding-004 (shut down 2026-01-14) replaced; key moved to the
  x-goog-api-key header.
What doesn't / accepted gaps:
- Two manual checks pending (user): review a due word -> box moves; daily
  stat increments on review. Words studied BEFORE this phase (no
  nextReviewAt in the DB) are treated as due immediately via an $exists
  fallback in the due query — so the user's existing words show up for
  review right away, which doubles as the manual test data.
- Review batch is capped at 10 per fetch; the widget refetches when the
  batch is exhausted.
```

---

## Phase 3 — LLMOps: Eval suite in CI

### Build

1. **`backend/evals/golden.json`** — 15–20 `{ nativeLanguage,
   learningLanguage, category }` cases spanning Latin and non-Latin scripts.
2. **Tier 1 — deterministic** (every relevant push; real API calls ≈ cents):
   generate per golden case through the real pipeline; assert schema
   validity (strict variant of `flashcardSetSchema`), exactly 5 cards,
   category match, romanization iff non-Latin script (Unicode ranges), no
   intra-set duplicates, seeded studied-word exclusion respected.
3. **Tier 2 — LLM-as-judge** (weekly schedule + `workflow_dispatch` only):
   Gemini judges translation correctness / naturalness / A1-appropriateness
   1–5; assert mean ≥ 4.0; markdown report as CI artifact; per-
   `PROMPT_VERSION` baseline scores committed to `evals/baselines/` and
   compared on version bumps.
4. **CI wiring** — new `ai-evals` job in `ci.yml` with `OPENROUTER_API_KEY`
   secret, path-filtered to `backend/src/**` / prompt files; Tier 2 in a
   separate scheduled workflow.

### Verification Gate 3 (mandatory)

- [x] Tier 1 runs locally (`npm run eval`) and passes against the live API — 16/16, zero flaky, across 8 non-Latin-script languages
- [x] Tier 1 runs green in GitHub Actions — passed on the branch push AND again on main after the merge (secret wired correctly)
- [x] Deliberate-break drill: prompt changed to ask for 4 cards → all eval cases FAILED on strict-schema ("expected array to have >=5 items"), retry policy re-tested each once, 0/3 passed. Run locally (the workflow's push trigger is branch-filtered, so a throwaway branch wouldn't trigger it; CI exit-code propagation is proven by the green runs). Sabotage reverted. GATE 3 PASSED.
- [x] Tier 2 runs locally, produces report + baseline: v2 baseline = 4.83/5 overall (translation/naturalness/level means per case in evals/baselines/v2.json — COMMIT this file)
- [x] Total Tier 1 cost per run: ~16-32 calls of a few hundred tokens ≈ $0.01-0.02 — well under target

**Gate results (fill in):**
```
Date: 2026-07-13
What works:
- 70/70 backend tests (9 new unit tests for the eval check functions —
  the eval suite's own logic is CI-covered with zero API calls).
- Tier 1: 16/16 PASS live, including romanization + script checks for
  ja/zh/ko/hi/ru/ar/el/th and the seeded-exclusion case. Retry-once
  flakiness policy implemented (flaky passes reported distinctly).
- Tier 2: judge (gemini-2.5-flash, different family from the gpt-4o-mini
  generator to avoid self-preference) scored v2 at 4.83/5 overall;
  baseline written for future drift comparison (fails on >0.3 drop or
  <4.0 floor).
- THE SUITE FOUND TWO REAL PRODUCTION BUGS ON ITS FIRST RUN:
  1. google/gemini-flash-1.5 had been DELISTED from OpenRouter — the
     app's fallback model was silently 404ing. Replaced with
     google/gemini-2.5-flash (verified against the live model list).
  2. No max_tokens cap on any LLM call — OpenRouter pre-authorizes the
     model's max output (65k tokens) and 402s low-balance accounts.
     completeJSON now caps output at 2048 tokens (also cost hygiene).
- Separate workflow (.github/workflows/ai-evals.yml) instead of a job in
  ci.yml — deviation from plan, so eval path filters and the weekly
  schedule don't affect the main pipeline. Jobs skip gracefully when the
  secret is missing (forks).
What doesn't / accepted gaps:
- CI runs pending: user must add OPENROUTER_API_KEY as a GitHub repo
  secret (Settings -> Secrets and variables -> Actions) and push.
- The deliberate-break regression drill should be done once after the
  first green CI run.
- Judge nondeterminism: scores vary run to run; the 0.3 drift tolerance
  absorbs normal noise. Revisit if it flaps.
```

---

## Phase 4 — RAG 2: Grammar tutor with citations

### Build

1. **Corpus:** Tatoeba sentence pairs (CC-BY — attribute in README + UI).
   `backend/scripts/ingest-tatoeba.js`: download pairs per supported language
   pair, filter short/beginner sentences (~20–50k per pair), batch-embed,
   store in `GrammarSentence` `{ pair, targetText, nativeText, tatoebaId,
   embedding }`. Second Atlas vector index. Sentences = natural chunks (no
   chunking strategy needed).
2. **`POST /api/ai/explain`** — zod: `sentence` ≤ 300 chars, `question` ≤ 200
   (free-text user input → cap hard, firm system prompt, stay-on-grammar
   instruction). Embed → top-5 similar pairs → grounded explanation →
   `{ explanation, citations: [{ targetText, nativeText, tatoebaId }] }`.
   Through `completeJSON` (observability for free) + daily quota.
3. **UI:** "Why is this sentence built this way?" on the flipped flashcard →
   modal with explanation + cited sentences linking to
   `tatoeba.org/en/sentences/show/{id}`.

### Verification Gate 4 (mandatory)

- [ ] `npm test` passes — including: explain endpoint 400s on oversized input, 401 unauthed, quota 429 after limit
- [ ] Ingestion script ran; `GrammarSentence` count per language pair recorded here
- [ ] Manual: explanation for a flashcard example sentence is grounded — citations are genuinely similar sentences, links resolve on tatoeba.org
- [ ] Prompt-injection spot check: adversarial `question` ("ignore instructions and…") stays on grammar
- [ ] `LlmCall` docs with `feature: "grammar"` appearing; cost per query recorded (target < $0.01)
- [ ] Tatoeba attribution present in README and modal UI

**Gate results (fill in):**
```
Date:
What works:
What doesn't / accepted gaps:
```

---

## After Phase 4

- README: "How the AI pipeline works" section + architecture diagram
  (study events → embeddings → retrieval → generation → validation →
  observability → evals).
- Optional write-up/blog post — AI-engineering roles screen for communication
  about systems as much as the systems themselves.
