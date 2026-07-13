// Tier 2 eval: LLM-as-judge quality scoring.
//
//   node evals/judge.js
//
// Generates a fresh set for each golden case marked "judge": true, then has
// a JUDGE model score every card 1-5 on three axes:
//   translation  - is targetWord a correct translation of nativeWord?
//   naturalness  - is exampleTarget a natural, conversational sentence?
//   level        - is the word/example appropriate for an A1 beginner?
//
// Judge model is Gemini while the primary generator is GPT — different model
// families, because judges score their own family's output higher
// (self-preference bias).
//
// Baselines: the first run for a PROMPT_VERSION writes
// baselines/<version>.json. Later runs compare against it and fail if the
// overall mean drops more than DRIFT_TOLERANCE — that's the prompt
// regression test. Absolute floor: PASS_THRESHOLD.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

process.env.LLM_LOG_DISABLED = "1";

const { generateFlashcards, PROMPT_VERSION } = await import("../src/controllers/ai.controller.js");
const { completeJSON } = await import("../src/lib/llm.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "golden.json"), "utf8"));
const judgeCases = golden.filter((c) => c.judge);

const JUDGE_MODEL = "google/gemini-2.5-flash";
const PASS_THRESHOLD = 4.0;
const DRIFT_TOLERANCE = 0.3;

if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is not set - cannot run judge evals.");
  process.exit(1);
}

const scoreSchema = z.object({
  scores: z
    .array(
      z.object({
        targetWord: z.string(),
        translation: z.number().min(1).max(5),
        naturalness: z.number().min(1).max(5),
        level: z.number().min(1).max(5),
        comment: z.string().optional().default(""),
      })
    )
    .min(1),
});

function judgePrompt(caseDef, cards) {
  return `You are a strict ${caseDef.learningLanguage} language teacher reviewing beginner flashcards for a ${caseDef.nativeLanguage} speaker.

Score EVERY card on three axes from 1 (unacceptable) to 5 (excellent):
- translation: is targetWord a correct, common translation of nativeWord?
- naturalness: is exampleTarget a natural, conversational ${caseDef.learningLanguage} sentence that a native speaker would say?
- level: are the word and example appropriate for an absolute beginner (CEFR A1)?

Be harsh: awkward or textbook-stilted examples deserve 3 or less. Wrong or misleading translations deserve 1-2.

Cards:
${JSON.stringify(cards, null, 2)}

Respond with a JSON object of exactly this shape and nothing else:
{ "scores": [ { "targetWord": "...", "translation": 1-5, "naturalness": 1-5, "level": 1-5, "comment": "one short sentence, only if any score is below 4" } ] }
Return one entry per card, in the same order.`;
}

async function judgeCase(caseDef) {
  const cards = await generateFlashcards(
    caseDef.category,
    caseDef.nativeLanguage,
    caseDef.learningLanguage,
    null,
    { excludeWords: caseDef.excludeWords || [] }
  );

  const result = await completeJSON({
    feature: "eval",
    model: JUDGE_MODEL,
    prompt: judgePrompt(caseDef, cards),
    schema: scoreSchema,
  });

  const axes = ["translation", "naturalness", "level"];
  const means = Object.fromEntries(
    axes.map((axis) => [
      axis,
      result.scores.reduce((sum, s) => sum + s[axis], 0) / result.scores.length,
    ])
  );
  const overall = axes.reduce((sum, axis) => sum + means[axis], 0) / axes.length;

  return { id: caseDef.id, means, overall, scores: result.scores };
}

console.log(`Tier 2 judge evals: ${judgeCases.length} case(s), generator prompt ${PROMPT_VERSION}, judge ${JUDGE_MODEL}\n`);

const results = [];
for (const caseDef of judgeCases) {
  try {
    const r = await judgeCase(caseDef);
    console.log(
      `  ${r.id}: overall ${r.overall.toFixed(2)} ` +
        `(translation ${r.means.translation.toFixed(1)}, naturalness ${r.means.naturalness.toFixed(1)}, level ${r.means.level.toFixed(1)})`
    );
    results.push(r);
  } catch (error) {
    console.error(`  ${caseDef.id}: JUDGE FAILED - ${error.message}`);
    results.push({ id: caseDef.id, error: error.message });
  }
}

const scored = results.filter((r) => !r.error);
if (scored.length === 0) {
  console.error("\nNo cases could be judged - failing.");
  process.exit(1);
}

const overallMean = scored.reduce((sum, r) => sum + r.overall, 0) / scored.length;

// Baseline handling.
const baselinesDir = path.join(__dirname, "baselines");
fs.mkdirSync(baselinesDir, { recursive: true });
const baselinePath = path.join(baselinesDir, `${PROMPT_VERSION}.json`);

let verdictLines = [];
let failed = false;

if (overallMean < PASS_THRESHOLD) {
  failed = true;
  verdictLines.push(`FAIL: overall mean ${overallMean.toFixed(2)} is below the ${PASS_THRESHOLD} floor.`);
}

if (fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const drift = overallMean - baseline.overallMean;
  verdictLines.push(
    `Baseline (${baseline.date}): ${baseline.overallMean.toFixed(2)} -> now ${overallMean.toFixed(2)} (drift ${drift >= 0 ? "+" : ""}${drift.toFixed(2)})`
  );
  if (drift < -DRIFT_TOLERANCE) {
    failed = true;
    verdictLines.push(`FAIL: quality dropped more than ${DRIFT_TOLERANCE} below the ${PROMPT_VERSION} baseline.`);
  }
} else {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      { promptVersion: PROMPT_VERSION, date: new Date().toISOString(), overallMean, cases: scored.map((r) => ({ id: r.id, overall: r.overall })) },
      null,
      2
    )
  );
  verdictLines.push(`No baseline for ${PROMPT_VERSION} - wrote one. Commit evals/baselines/${PROMPT_VERSION}.json.`);
}

// Report.
const resultsDir = path.join(__dirname, "results");
fs.mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = [
  `# Tier 2 judge report`,
  ``,
  `- Date: ${new Date().toISOString()}`,
  `- Generator prompt: ${PROMPT_VERSION} | Judge: ${JUDGE_MODEL}`,
  `- Overall mean: ${overallMean.toFixed(2)} (floor ${PASS_THRESHOLD})`,
  ``,
  ...verdictLines.map((l) => `> ${l}`),
  ``,
  `| Case | Overall | Translation | Naturalness | Level |`,
  `|------|---------|-------------|-------------|-------|`,
  ...scored.map(
    (r) =>
      `| ${r.id} | ${r.overall.toFixed(2)} | ${r.means.translation.toFixed(1)} | ${r.means.naturalness.toFixed(1)} | ${r.means.level.toFixed(1)} |`
  ),
  ``,
  `## Low-score comments`,
  ...scored.flatMap((r) =>
    r.scores.filter((s) => s.comment).map((s) => `- ${r.id} / ${s.targetWord}: ${s.comment}`)
  ),
];
fs.writeFileSync(path.join(resultsDir, `judge-${stamp}.md`), report.join("\n"));

console.log(`\n${verdictLines.join("\n")}`);
console.log(`Overall: ${overallMean.toFixed(2)}. Report in evals/results/`);
process.exit(failed ? 1 : 0);
