// Tier 1 eval runner: drives the REAL generation pipeline (same code path as
// production: prompt build -> OpenRouter -> zod validation -> fallback chain)
// against the golden dataset, then applies deterministic quality checks.
//
//   node evals/run-evals.js               # all golden cases
//   node evals/run-evals.js --limit=3     # first N cases (cheap smoke)
//
// Needs OPENROUTER_API_KEY. Costs real money: ~16 calls of a few hundred
// tokens each — on the order of a cent or two per full run.
//
// LLM nondeterminism policy: a case that fails its checks gets ONE fresh
// regeneration. Passing on retry is reported as "flaky" (visible in the
// report) but does not fail the run; failing twice fails the run.

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Evals run without a DB and must not pollute dashboard stats.
process.env.LLM_LOG_DISABLED = "1";

const { generateFlashcards, PROMPT_VERSION } = await import("../src/controllers/ai.controller.js");
const { runChecks } = await import("./lib/checks.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "golden.json"), "utf8"));

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : golden.length;
const cases = golden.slice(0, limit);

const CONCURRENCY = 3;

if (!process.env.OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY is not set - cannot run evals.");
  process.exit(1);
}

async function runCase(caseDef) {
  const personalization = { excludeWords: caseDef.excludeWords || [] };

  async function attempt() {
    const cards = await generateFlashcards(
      caseDef.category,
      caseDef.nativeLanguage,
      caseDef.learningLanguage,
      null,
      personalization
    );
    const checks = runChecks(caseDef, cards);
    return { cards, checks, pass: checks.every((c) => c.pass) };
  }

  const started = Date.now();
  try {
    let result = await attempt();
    let flaky = false;
    if (!result.pass) {
      const failed = result.checks.filter((c) => !c.pass).map((c) => c.name);
      console.log(`  ~ ${caseDef.id}: failed [${failed.join(", ")}], retrying once...`);
      const retry = await attempt();
      if (retry.pass) {
        result = retry;
        flaky = true;
      } else {
        result = retry; // report the retry's failures
      }
    }
    return { id: caseDef.id, ...result, flaky, ms: Date.now() - started };
  } catch (error) {
    return {
      id: caseDef.id,
      pass: false,
      flaky: false,
      checks: [{ name: "generation", pass: false, detail: error.message }],
      ms: Date.now() - started,
    };
  }
}

console.log(`Tier 1 evals: ${cases.length} case(s), prompt ${PROMPT_VERSION}, concurrency ${CONCURRENCY}\n`);

const results = [];
for (let i = 0; i < cases.length; i += CONCURRENCY) {
  const chunk = cases.slice(i, i + CONCURRENCY);
  const chunkResults = await Promise.all(chunk.map(runCase));
  for (const r of chunkResults) {
    const mark = r.pass ? (r.flaky ? "~ FLAKY-PASS" : "+ PASS") : "x FAIL";
    console.log(`${mark}  ${r.id} (${r.ms} ms)`);
    for (const c of r.checks.filter((c) => !c.pass)) {
      console.log(`         ${c.name}: ${c.detail}`);
    }
    results.push(r);
  }
}

const passed = results.filter((r) => r.pass).length;
const flaky = results.filter((r) => r.flaky).length;
const failed = results.length - passed;

// Machine-readable + human-readable reports.
const resultsDir = path.join(__dirname, "results");
fs.mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
fs.writeFileSync(
  path.join(resultsDir, `tier1-${stamp}.json`),
  JSON.stringify({ promptVersion: PROMPT_VERSION, date: new Date().toISOString(), results }, null, 2)
);

const reportLines = [
  `# Tier 1 eval report`,
  ``,
  `- Date: ${new Date().toISOString()}`,
  `- Prompt version: ${PROMPT_VERSION}`,
  `- Result: ${passed}/${results.length} passed (${flaky} flaky, ${failed} failed)`,
  ``,
  `| Case | Result | Failed checks |`,
  `|------|--------|---------------|`,
  ...results.map((r) => {
    const status = r.pass ? (r.flaky ? "FLAKY-PASS" : "PASS") : "FAIL";
    const failedChecks = r.checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail})`).join("; ") || "-";
    return `| ${r.id} | ${status} | ${failedChecks} |`;
  }),
];
fs.writeFileSync(path.join(resultsDir, `tier1-${stamp}.md`), reportLines.join("\n"));

console.log(`\n${passed}/${results.length} passed (${flaky} flaky). Reports in evals/results/`);
process.exit(failed > 0 ? 1 : 0);
