# Phase 2 + 2.5: RAG Personalization & the Leitner Revision Deck

This document explains how Speakzy's flashcard generation became
retrieval-augmented and personalized, and how the same study data powers a
zero-cost spaced-repetition review deck. Companion to
PHASE_1_OBSERVABILITY.md — same format: the problem, the components, the
decisions, and how to defend it all in an interview.

---

## 1. The problem

Before Phase 2, flashcard generation was stateless: every set was 5 random
words for a random category. Nothing stopped the model from teaching you
"bread" for the fourth day in a row, and nothing connected new material to
what you already knew. The app had study history (Phase 0 built it) but the
generation pipeline couldn't see it.

Two learning-science ideas drive the fix:

- **Don't repeat mastered material** — wasted quota, wasted attention.
- **Comprehensible input (Krashen's "i+1")** — new vocabulary sticks best
  when it appears in context you already understand. If you know "eau"
  (water), the example sentence for a new word should try to use "eau".

And one engineering idea: **this is what RAG actually is** — retrieval
shaping generation. Not "chat with a PDF": retrieval of _your_ study history
shaping _your_ next lesson.

---

## 2. What was built (component by component)

### 2.1 Embeddings: `backend/src/lib/embeddings.js`

Words are compared by _meaning_, not spelling, using text embeddings —
vectors where semantically similar texts land close together. Provider:
Google `gemini-embedding-001` (free tier).

Three provider details that cost real debugging time (interview stories):

1. **OpenRouter has no embeddings endpoint.** It proxies chat completions
   only. So generation goes through OpenRouter but embeddings need a direct
   provider — this is WHY `embeddings.js` exists as a separate module.
2. **The model we started with was dead.** `text-embedding-004` — the model
   most tutorials still name — was shut down on 2026-01-14. A web check
   before first use caught it; `gemini-embedding-001` is the current stable.
   Lesson: verify model availability against live docs, not memory.
3. **Google's new API keys look "wrong".** AI Studio now issues auth keys
   prefixed `AQ.` instead of the classic `AIza...`. They are valid — sent via
   the `x-goog-api-key` header (which also keeps keys out of URLs and logs).
   Tools that regex-validate the old prefix reject them; direct API calls
   don't care.

Dimensions: the model's native output is 3072 dims; we request **768** via
`outputDimensionality` (Matryoshka truncation) to quarter storage and speed
up cosine. Truncated vectors aren't pre-normalized — fine, because our cosine
implementation divides by magnitudes.

**Graceful degradation is a hard requirement:** with no `GEMINI_API_KEY`,
`embedText` returns null, retrieval returns `[]`, and generation still works
— only the known-word weaving is skipped. The exclusion list needs no
vectors at all.

### 2.2 Retrieval: `backend/src/lib/retrieval.js` — the two-driver design

One interface, two implementations, chosen by `VECTOR_DRIVER`:

| Driver             | How                                                             | When                                                                                                                                    |
| ------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `memory` (default) | Fetch the user's word vectors, cosine in Node, sort, take top-k | A user knows at most a few hundred words — brute force is microseconds, needs no index, and runs identically in CI, local dev, and prod |
| `atlas`            | MongoDB Atlas `$vectorSearch` aggregation                       | When a corpus outgrows brute force — Phase 4's ~50k Tatoeba sentences. Requires a vector index created in the Atlas UI                  |

This is the interview answer to "why didn't you use Pinecone?": **vector
databases exist for corpora too big to scan; a per-user corpus of hundreds
is not that.** Using an index there is resume-driven engineering. The
interface means the swap is one env var when the corpus justifies it.

Also here: `normalizeWord` — case- and diacritic-insensitive normalization
("Café" -> "cafe") via NFD decomposition + combining-mark stripping. Used
everywhere words are compared.

### 2.3 The personalized generation pipeline (in `ai.controller.js`)

For each new set (`PROMPT_VERSION = "v2"`):

```
1. EXCLUDE  - fetch the user's 100 most recent studied words (exact list,
              no vectors needed) -> prompt rule: "do NOT use these as
              targetWord" + a normalized exclusion Set for step 4
2. RETRIEVE - embed the day's category ("food vocabulary") — cached per
              process, categories never change -> top-8 semantically
              closest known words via the retrieval interface
3. GENERATE - both lists injected INTO the prompt's rules block (not
              appended after the JSON-format instructions, which would
              weaken format adherence). Known words: "reuse a few of these
              inside exampleTarget sentences"
4. POST-FILTER - never trust the model to obey: drop any card whose
              normalized targetWord is in the exclusion Set
5. RETRY    - if fewer than 5 cards survive, ONE retry that also excludes
              everything just generated; merge unique survivors
6. LAST RESORT - if everything was dropped, serve the original set anyway:
              reviewing a studied word beats an error screen
```

Observability ties in from Phase 1: every generation logs
`meta.excludedCount` and `meta.retrievedCount` on its `LlmCall`, and a retry
logs `droppedFromPrevious` — so personalization behavior is visible in data,
not just believed.

**Cold start:** a brand-new user has no history -> both lists are empty ->
the prompt is exactly the old v1 behavior. No special-casing needed; the
pipeline degrades to its baseline.

### 2.4 Embedding backfill on study events

When you reveal a card, `POST /api/ai/study` upserts the word and then
fire-and-forgets an embedding call (`"targetWord - nativeWord"`), storing the
vector on the `StudiedWord` doc. Same rule as Phase 1 logging: **a side
effect never blocks a user response.** If the embedding call fails, the word
still counts — it just won't participate in retrieval until a later study
event retries it.

### 2.5 Phase 2.5: the Leitner revision deck (`review.controller.js`)

The same study corpus, used a second way — replayed instead of retrieved:

- Every word sits in a **box 1-5**. Review intervals: 1, 2, 4, 7, 14 days.
- Review correct -> up one box (longer gap). Wrong -> back to box 1 (see it
  tomorrow). This approximates the forgetting curve: a word resurfaces right
  around when you'd lose it.
- `GET /api/ai/review` returns due cards (`nextReviewAt <= now`), weakest box
  first. `POST /api/ai/review { targetWord, correct }` applies the move.
- Study events snapshot the full card (examples, romanization), so revision
  replays real content. **The whole loop makes zero LLM calls** — there is a
  test asserting no `LlmCall` documents are created by review actions.
- Reviews increment `timesStudied`/`knewIt`, so they count toward daily
  stats and strengthen the signal future phases can read ("words that keep
  failing review" is a priority queue waiting to be used).

The one-liner: **"the AI feature generates; the revision feature runs free
off its exhaust data."**

Why Leitner and not Anki's SM-2: SM-2 has magic constants (ease factors,
1.3 floors) you'd be cargo-culting. Leitner is five boxes and five intervals
— every line explainable, which is the point of a portfolio project.

### 2.6 Legacy-data edge case worth remembering

Words studied _before_ Phase 2.5 have no `nextReviewAt` field in the DB
(schema defaults only apply to new documents — Mongoose applies them on
hydration in memory, but the DB field stays absent, so date queries miss
them). Fix: the due-query treats a missing `nextReviewAt` as due now
(`$or` with `$exists: false`). Classic schema-evolution lesson: adding a
field with a default does NOT backfill existing rows.

---

## 3. Design decisions and tradeoffs (interview gold)

| Decision                             | Alternative rejected               | Why                                                                                                               |
| ------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Brute-force cosine for user words    | Vector DB / Atlas index everywhere | Hundreds of vectors: scan is microseconds; identical behavior in CI; index is one env var away when justified     |
| Exclusion via prompt AND post-filter | Trust the prompt                   | Models ignore instructions nondeterministically; the filter is the guarantee, the prompt just raises the hit rate |
| One retry, then serve what survived  | Loop until 5 clean cards           | Bounded cost and latency; a repeated word is a UX blemish, an infinite retry loop is an outage                    |
| 768-dim truncation                   | Native 3072 dims                   | 4x smaller storage and faster cosine; Matryoshka training makes truncation nearly lossless for this use           |
| Category vector cached per process   | Re-embed per request               | 10 fixed categories; failures NOT cached so a transient outage doesn't disable retrieval until restart            |
| Leitner over SM-2                    | Anki's algorithm                   | Explainable > sophisticated for a portfolio; swap is localized in one controller                                  |
| Snapshot cards at study time         | Regenerate for review              | Regeneration costs money and produces a DIFFERENT card; the review promise is "the card you saw"                  |
| Reviews bump study counters          | Separate review stats              | Reviewing IS studying; keeps "Words studied today" honest and feeds knewIt back into the data                     |

---

## 4. File map

```
backend/src/lib/embeddings.js        gemini-embedding-001 client (768 dims, header auth)
backend/src/lib/retrieval.js         normalizeWord, cosine, memory/atlas drivers
backend/src/controllers/ai.controller.js  buildPrompt v2, exclusion+retrieval+post-filter
                                     pipeline, embedding backfill on study
backend/src/controllers/review.controller.js  Leitner: due query + box transitions
backend/src/models/StudiedWord.js    + box, nextReviewAt, card snapshot, embedding
backend/src/lib/aiSchemas.js         + snapshot fields, reviewResultSchema
frontend/src/components/ReviewWidget.jsx   due badge, flip card, Forgot/Got it
frontend/src/context/StudyStatsContext.jsx  sends card snapshots with study events
backend/src/test/rag.test.js         9 tests: prompt content, post-filter, retry,
                                     cold start, meta counts, cosine/normalize
backend/src/test/review.test.js      9 tests: due filter, box math, cap, reset,
                                     snapshots, negatives, LLM-free assertion
```

---

## 5. How to demo it (2 minutes)

1. Reveal a few cards on the home page, then hit "Next Lesson" — point out
   none of the studied words come back, and example sentences start reusing
   words you know.
2. Open `/admin` -> the generation row's calls carry `retrievedCount` in
   their metadata; a fresh account logs 0.
3. Scroll to the Review widget: answer a due card "Got it", note the box
   caption; answer one "Forgot", note it comes back tomorrow.
4. Kill the `GEMINI_API_KEY` env var and generate again: everything still
   works, minus the weaving — graceful degradation, live.

---

## 6. Interview prep — likely questions, honest answers

**"Is this really RAG?"**
Yes, by the definition that matters: retrieval (vector similarity over a
per-user corpus) augmenting generation (the retrieved words shape the
prompt). It's not document QA — it's closer to how production
personalization systems use RAG. Cold start, post-filtering, and graceful
degradation are the parts document-QA tutorials skip.

**"Why not embed with the same provider as generation?"**
I wanted to — OpenRouter doesn't serve embeddings. That forced a second
provider and, in hindsight, a better design: `embeddings.js` is a seam where
providers swap without touching the pipeline.

**"What happens when the model ignores your exclusion list?"**
It does, sometimes — that's why the server post-filters and retries once.
There's a test where the model returns a studied word (with different
casing, "Pain" vs "pain") and the served set provably excludes it.

**"How do you know retrieval is working?"**
Three ways: integration tests with deterministic mock vectors; the
`retrievedCount`/`excludedCount` metadata on every logged call; and the
product behavior itself (known words appearing in example sentences).

**"Why do reviews cost nothing?"**
Cards are snapshotted at study time and replayed from the DB. The LLM
generates once; the revision system reuses. There's a test asserting the
review endpoints create zero LLM-call log documents.

**"What broke while building this?"**
The embedding model I planned for had been shut down for six months
(text-embedding-004, dead 2026-01-14), and Google's new AQ.-prefixed keys
look invalid if you expect the old AIza format. Both were caught by checking
live documentation instead of trusting training data — which is now my
default for any provider integration.

---

## 7. Verification record

- 61/61 backend tests green (9 RAG + 9 review tests added this phase).
- Embeddings verified live end-to-end: single + batch calls returning
  768-dim vectors with the new-format key.
- User-verified in the browser: studied words don't reappear; known words
  show up in examples; due words appear in Review and box transitions work;
  reviews increment daily stats.
- Full gate checklists: AI_ROADMAP.md, "Verification Gate 2" and "Gate 2.5".
