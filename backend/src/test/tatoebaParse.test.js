import { describe, it, expect } from "vitest";
import { parseAnkiLine, isBeginnerSentence, parsePairFile } from "../../scripts/lib/tatoebaParse.js";

const LINE =
  "I eat bread.\tJe mange du pain.\tCC-BY 2.0 (France) Attribution: tatoeba.org #1234 (alice) & #5678 (bob)";

describe("tatoeba ingestion parsing", () => {
  it("parses a manythings pair line, taking the TARGET sentence's tatoeba id", () => {
    expect(parseAnkiLine(LINE)).toEqual({
      nativeText: "I eat bread.",
      targetText: "Je mange du pain.",
      tatoebaId: 5678,
    });
  });

  it("rejects malformed lines", () => {
    expect(parseAnkiLine("just some text")).toBeNull();
    expect(parseAnkiLine("a\tb\tno ids here")).toBeNull();
    expect(parseAnkiLine("")).toBeNull();
  });

  it("filters for beginner-length single sentences", () => {
    expect(isBeginnerSentence("Je mange du pain.", "I eat bread.")).toBe(true);
    expect(isBeginnerSentence("Oui.", "Yes.")).toBe(false); // too short
    expect(isBeginnerSentence("x".repeat(91), "long")).toBe(false); // too long
    expect(isBeginnerSentence("Il pleut. Je reste.", "It rains. I stay.")).toBe(false); // two sentences
  });

  it("dedupes by id and by normalized target text, and respects the limit", () => {
    const content = [
      LINE,
      LINE, // exact duplicate id
      "I eat bread!\tJE MANGE DU PAIN.\tAttribution: tatoeba.org #1 (a) & #9999 (b)", // dup text, different id
      "It rains.\tIl pleut souvent.\tAttribution: tatoeba.org #2 (a) & #8888 (b)",
      "I drink water.\tJe bois de l'eau.\tAttribution: tatoeba.org #3 (a) & #7777 (b)",
    ].join("\n");

    const twoAllowed = parsePairFile(content, 2);
    expect(twoAllowed).toHaveLength(2);
    expect(twoAllowed.map((s) => s.tatoebaId)).toEqual([5678, 8888]);

    const all = parsePairFile(content, 100);
    expect(all.map((s) => s.tatoebaId)).toEqual([5678, 8888, 7777]);
  });
});
