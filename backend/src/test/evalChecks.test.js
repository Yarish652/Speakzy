import { describe, it, expect } from "vitest";
import { runChecks, isLatinScript } from "../../evals/lib/checks.js";

// The eval suite's own logic must be trustworthy — these tests run in normal
// CI with zero API calls.

function card(overrides = {}) {
  return {
    nativeWord: "bread",
    targetWord: "pain",
    romanization: "",
    exampleTarget: "Je mange du pain.",
    exampleNative: "I eat bread.",
    partOfSpeech: "noun",
    difficulty: "A1",
    category: "food",
    ...overrides,
  };
}

function goodSet() {
  return [
    card(),
    card({ nativeWord: "water", targetWord: "eau", exampleTarget: "Je bois de l'eau." }),
    card({ nativeWord: "cheese", targetWord: "fromage" }),
    card({ nativeWord: "apple", targetWord: "pomme" }),
    card({ nativeWord: "milk", targetWord: "lait" }),
  ];
}

const frCase = { id: "t", nativeLanguage: "english", learningLanguage: "french", category: "food", nonLatin: false };
const jaCase = { id: "t", nativeLanguage: "english", learningLanguage: "japanese", category: "food", nonLatin: true };

const allPass = (results) => results.every((r) => r.pass);
const failing = (results) => results.filter((r) => !r.pass).map((r) => r.name);

describe("eval checks", () => {
  it("passes a fully valid Latin-script set", () => {
    expect(allPass(runChecks(frCase, goodSet()))).toBe(true);
  });

  it("fails when there are not exactly 5 cards", () => {
    expect(failing(runChecks(frCase, goodSet().slice(0, 4)))).toContain("strict-schema");
  });

  it("fails on a missing example sentence (strict, unlike runtime schema)", () => {
    const set = goodSet();
    set[2] = card({ nativeWord: "cheese", targetWord: "fromage", exampleTarget: "" });
    expect(failing(runChecks(frCase, set))).toContain("strict-schema");
  });

  it("fails on a wrong category", () => {
    const set = goodSet();
    set[1] = card({ nativeWord: "water", targetWord: "eau", category: "travel" });
    expect(failing(runChecks(frCase, set))).toContain("category-match");
  });

  it("fails on duplicate target words, case- and accent-insensitively", () => {
    const set = goodSet();
    set[4] = card({ nativeWord: "milk", targetWord: "PAIN" });
    expect(failing(runChecks(frCase, set))).toContain("no-duplicates");
  });

  it("requires romanization for non-Latin languages and rejects Latin-script targets", () => {
    // Latin-script French words presented as if they were Japanese output.
    const results = runChecks(jaCase, goodSet());
    const names = failing(results);
    expect(names).toContain("romanization-present");
    expect(names).toContain("target-script-non-latin");
  });

  it("passes a valid Japanese set", () => {
    const set = [
      card({ nativeWord: "bread", targetWord: "パン", romanization: "pan", exampleTarget: "パンを食べます。" }),
      card({ nativeWord: "water", targetWord: "水", romanization: "mizu", exampleTarget: "水を飲みます。" }),
      card({ nativeWord: "cheese", targetWord: "チーズ", romanization: "chiizu", exampleTarget: "チーズが好きです。" }),
      card({ nativeWord: "apple", targetWord: "りんご", romanization: "ringo", exampleTarget: "りんごを買います。" }),
      card({ nativeWord: "milk", targetWord: "牛乳", romanization: "gyuunyuu", exampleTarget: "牛乳を飲みます。" }),
    ];
    expect(allPass(runChecks(jaCase, set))).toBe(true);
  });

  it("catches exclusion violations", () => {
    const withExclusions = { ...frCase, excludeWords: ["Pain", "eau"] };
    expect(failing(runChecks(withExclusions, goodSet()))).toContain("exclusions-respected");
  });

  it("script detection handles diacritics as Latin (encoding canary)", () => {
    expect(isLatinScript("École café naïve")).toBe(true);
    expect(isLatinScript("パン")).toBe(false);
    expect(isLatinScript("नमस्ते")).toBe(false);
  });
});
