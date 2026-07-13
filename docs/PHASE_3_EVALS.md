# Phase 3: The Eval Suite — Testing an LLM Like It's Software

This document explains Speakzy's AI eval suite: why LLM features need their
own kind of testing, how the two-tier design works, and — the headline — the
two real production bugs it caught **on its first run**. Companion to
PHASE_1_OBSERVABILITY.md and PHASE_2_RAG_PERSONALIZATION.md, same format.

---

## 1. The problem

Normal tests can't tell you whether an LLM feature is *good*.

The vitest suite mocks the model and proves the plumbing: schema validation
fires, fallback chains retry, quotas count down. But it cannot answer:

- Does the real model actually return 5 cards, every time, in 16 languages?
- Does a Japanese card come back in Japanese script — or in English?
- Does romanization show up when it must, and stay away when it mustn't?
- When the model is told "don't teach these words," does it listen?
- If I reword the prompt, did quality get better or quietly worse?

The last one is the killer. A prompt edit is a deploy — it changes production
behavior — but without evals it ships with zero test coverage. **Evals are
regression tests where the unit under test is the model's behavior, not your
code.**

---

## 2. The headline: two production bugs caught on day one

Worth leading with, because it's the whole argument for evals in one story.

### Bug 1: the fallback model had been silently dead

The app's resilience story was "if GPT-4o-mini fails, Gemini Flash catches
the request." The very first Tier 2 run tried to use the judge model —
`google/gemini-flash-1.5` — and got:

```
404 {"error":{"message":"No endpoints found for google/gemini-flash-1.5"}}
```

The model had been **delisted from OpenRouter**. The same id was the app's
production `FALLBACK_MODEL` — meaning the fallback chain had been silently
broken for an unknown amount of time. Every "resilient" retry would have
404'd. No test caught it because the vitest suite *mocks* the network; no
user caught it because the primary model rarely fails. Only something that
exercises the **real provider** could see it.

Fix: replaced with `google/gemini-2.5-flash` after checking OpenRouter's
**live** model list (`GET https://openrouter.ai/api/v1/models`) — not
memory, not a tutorial. (Same lesson as Phase 2's dead embedding model:
model catalogs churn; verify against live docs.)

### Bug 2: no max_tokens cap — an open-ended spend on every call

The retry with the new judge model failed differently:

```
402 "You requested up to 65535 tokens, but can only afford 13031."
```

No call in the app set `max_tokens`, so OpenRouter pre-authorized each
request for the model's **maximum possible output** — 65k tokens, ~16 cents
of headroom per call. On a low-balance account that's an outright 402; on a
funded account it's a silent risk: any confused model could legally return a
$0.16 essay when we needed 5 flashcards.

Fix: `completeJSON` now caps every call at 2048 output tokens (our largest
legitimate response is well under that). One line, two wins: low-balance
accounts work, and no response can ever cost more than the cap.

**The one-liner for interviews:** "My eval suite found a dead fallback model
and an unbounded token spend on its first run — before any user did."

---

## 3. The design: two tiers, different jobs, different costs

### Tier 1 — deterministic checks (cheap, run on every backend change)

`npm run eval` drives the **real production pipeline** — same
`generateFlashcards()` the app calls, same prompt builder, same schema
validation, same fallback chain — against a 16-case golden dataset, then
applies checks that need no LLM to grade:

| Check | Catches |
|---|---|
| `strict-schema` | wrong card count, missing examples, difficulty != "A1" |
| `category-match` | cards drifting off the requested theme |
| `no-duplicates` | same word twice in a set (case/accent-insensitive) |
| `romanization-present/empty` | missing romaji for Japanese; spurious romanization for French |
| `target-script-*` | a "Japanese" card written in Latin letters (model answered in English) |
| `exclusions-respected` | studied words coming back as new cards (the RAG contract) |

Strictness note: the *runtime* schema is deliberately lenient (a slightly
off card shouldn't cost a user their generation), but the *eval* schema
demands the full contract. Production forgives; CI doesn't.

**Golden dataset** (`evals/golden.json`): 16 cases across French, Spanish,
German, Italian, Portuguese, Japanese, Chinese, Korean, Hindi, Russian,
Arabic, Greek, and Thai, plus reverse directions (fr->en, hi->en) and one
case with a seeded exclusion list. Non-Latin scripts are where format
instructions fail most, so more than half the dataset lives there.

**Flakiness policy:** LLMs are nondeterministic — one bad sample shouldn't
block a merge, but it shouldn't be invisible either. A failing case gets ONE
fresh regeneration; passing on retry is reported distinctly as `FLAKY-PASS`
(visible in the report, doesn't fail the run); failing twice fails the run.

**Cost:** ~16-32 calls of a few hundred tokens ≈ $0.01-0.02 per run.

### Tier 2 — LLM-as-judge (costlier, scheduled weekly + on demand)

`npm run eval:judge` generates fresh sets for 8 representative cases and has
a judge model score every card 1-5 on three axes: **translation accuracy**,
**naturalness** of the example sentence, and **A1 level-appropriateness** —
things no regex can grade.

Two design details that matter:

1. **Cross-family judging.** The generator is GPT (gpt-4o-mini); the judge
   is Gemini (gemini-2.5-flash). Models score their own family's output
   higher — *self-preference bias* — so same-family judging inflates scores.
2. **Committed baselines = prompt regression tests.** The first run for a
   `PROMPT_VERSION` writes `evals/baselines/<version>.json` (v2 baseline:
   **4.83/5 overall**). Every later run compares against it and **fails on a
   drop > 0.3** (or below the absolute 4.0 floor). Change the prompt, bump
   the version, and CI tells you whether quality moved — that's the loop
   Phase 1's `promptVersion` field was built for.

### CI wiring (`.github/workflows/ai-evals.yml`)

A separate workflow from the main CI — deliberately, so its path filters and
schedule can't affect the test/build pipeline:

- **Tier 1**: pushes/PRs touching `backend/**` only. Verified live: a
  docs-only commit correctly SKIPPED it (evals only spend money when model-
  facing code changes) while normal CI still ran.
- **Tier 2**: weekly schedule (Mondays) + manual `workflow_dispatch`.
- Reports upload as artifacts; jobs skip gracefully when the
  `OPENROUTER_API_KEY` secret is absent (e.g. on forks).
- `LLM_LOG_DISABLED=1` in eval runs: no DB connection needed, and eval calls
  don't pollute the Phase 1 dashboard stats.

### The eval suite tests itself

The check functions are pure and unit-tested (`evalChecks.test.js`, 9 tests,
zero API calls) — including the script-detection logic with Japanese, Hindi,
and accented-Latin inputs. If the checks rot, normal CI says so for free.

---

## 4. The deliberate-break drill (proving the net catches)

A safety net you've never seen fail is a hypothesis, not a safety net. So:
the prompt was deliberately sabotaged to ask for **4** cards instead of 5,
and Tier 1 was re-run. Result:

```
x FAIL  en-fr-food            strict-schema: expected array to have >=5 items
x FAIL  en-fr-food-exclusions strict-schema: expected array to have >=5 items
x FAIL  en-es-travel          strict-schema: expected array to have >=5 items
0/3 passed
```

Every case failed, the retry policy correctly gave each a second chance,
and the run exited non-zero (which fails the CI job). Sabotage reverted.
This is the eval-suite equivalent of a fire drill — do it once per suite.

---

## 5. Design decisions and tradeoffs (interview gold)

| Decision | Alternative rejected | Why |
|---|---|---|
| Two tiers | One suite that does everything | Deterministic checks are cheap enough for every push; judge calls are not. Split by cost and purpose |
| Drive the real pipeline | Test prompts in isolation | The unit under test is prompt + model + schema + fallback *together*; isolating the prompt tests a fiction |
| Retry-once flakiness policy | Fail on first bad sample / retry until green | One resample separates "model had a bad roll" from "prompt is broken"; unlimited retries would mask real regressions |
| Cross-family judge | GPT judges GPT | Self-preference bias inflates same-family scores |
| Committed baselines | Fixed absolute threshold only | An absolute floor misses slow drift; a per-version baseline catches "v3 is worse than v2" even when both clear 4.0 |
| Golden set weighted to non-Latin scripts | Uniform language sampling | Format failures concentrate where script + romanization rules interact — test where it breaks |
| Separate workflow file | Job inside ci.yml | Path filters + schedule stay isolated from the main pipeline; eval money is only spent when model-facing code changes |
| `LLM_LOG_DISABLED` env switch | Let evals log to LlmCall | Eval traffic would pollute product dashboards; runners also need no DB at all |

---

## 6. File map

```
backend/evals/golden.json            16 cases, 13 languages, judge subset flagged
backend/evals/lib/checks.js          pure deterministic checks (unit-tested)
backend/evals/run-evals.js           Tier 1 runner: real pipeline + checks + reports
backend/evals/judge.js               Tier 2 runner: cross-family judge + baselines
backend/evals/baselines/v2.json      committed quality baseline (4.83/5)
backend/evals/results/               run reports (gitignored)
backend/src/test/evalChecks.test.js  the checks' own unit tests
.github/workflows/ai-evals.yml       Tier 1 on backend changes, Tier 2 weekly
backend/src/lib/llm.js               max_tokens cap + LLM_LOG_DISABLED (both from this phase)
```

---

## 7. How to demo it (2 minutes)

1. `cd backend && npm run eval -- --limit=3` — three live cases pass in ~20s.
2. Open `evals/golden.json`: point at the Japanese/Hindi/Arabic cases and the
   seeded-exclusion case ("my RAG contract is CI-tested").
3. Open `evals/baselines/v2.json`: "quality is a number with a committed
   baseline; a prompt change that drops it 0.3 fails CI."
4. Tell the day-one story: dead fallback model, unbounded max_tokens.
5. Optional flex: change the prompt to ask for 4 cards, re-run, watch it fail.

---

## 8. Interview prep — likely questions, honest answers

**"How do you test something nondeterministic?"**
Split the properties. Structure (count, schema, script, exclusions) is
checkable deterministically on every sample. Quality is scored by a judge
model and compared statistically against a baseline with a drift tolerance.
And flakiness is *policy*, not accident: one resample, distinctly reported.

**"Isn't LLM-as-judge circular?"**
It would be if the judge graded its own family — models prefer their own
outputs. That's why Gemini judges GPT here. It's still imperfect (judges
have biases), which is why the deterministic tier exists and why judge
results gate on *relative drift* rather than being trusted as absolute truth.

**"Why do evals cost money on every push? Isn't that wasteful?"**
Tier 1 is a cent or two, path-filtered to model-facing changes only —
verified by a docs-only push that skipped it. Compare that to the cost of
the bug it caught: a silently dead fallback model in production.

**"What did it actually catch?"**
Two things, first run: the delisted fallback model (404 on every would-be
fallback in prod) and the missing max_tokens cap (402s for low-balance
accounts; unbounded spend ceiling for funded ones). Neither was catchable by
mocked tests, because both live in the gap between my code and the provider.

**"How do you know the suite itself works?"**
Three ways: its check functions have their own unit tests; a deliberate-
break drill (prompt asks for 4 cards) failed every case exactly as designed;
and the exit code is wired into CI, proven by green runs on real pushes.

---

## 9. Verification record

- Tier 1: **16/16 PASS live, zero flaky**, across 13 languages (~$0.02/run).
- Tier 2: judge ran clean after the model fix — **v2 baseline 4.83/5**
  (translation 4.2-5.0, naturalness 4.4-5.0, level 4.6-5.0 per case).
- Green in GitHub Actions on the feature branch AND on main post-merge;
  docs-only push correctly skipped evals (path filter verified).
- Deliberate-break drill: 0/3 pass on a sabotaged prompt, then reverted.
- 70/70 backend unit/integration tests unaffected.
- Full gate checklist: AI_ROADMAP.md, "Verification Gate 3".
