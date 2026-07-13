// Pure parsing/filtering helpers for the Tatoeba ingestion script.
// Kept LLM- and IO-free so they can be unit-tested (src/test/tatoebaParse.test.js).
//
// Input format (manythings.org/anki pair files, Tatoeba-derived, CC-BY):
//   <english sentence>\t<target sentence>\tCC-BY 2.0 (France) Attribution: tatoeba.org #<engId> (user) & #<targetId> (user)

// Parse one line into { nativeText, targetText, tatoebaId } or null.
// tatoebaId is the TARGET sentence's id (second #id in the attribution),
// so citation links open the target-language sentence on tatoeba.org.
export function parseAnkiLine(line) {
  const parts = line.split("\t");
  if (parts.length < 3) return null;

  const [nativeText, targetText, attribution] = parts;
  if (!nativeText?.trim() || !targetText?.trim()) return null;

  const ids = [...attribution.matchAll(/#(\d+)/g)].map((m) => parseInt(m[1], 10));
  if (ids.length < 2) return null;

  return {
    nativeText: nativeText.trim(),
    targetText: targetText.trim(),
    tatoebaId: ids[1],
  };
}

// Beginner-friendly filter: short, single-sentence, everyday material.
// Length is measured in characters (word counts mislead for zh/ja/th).
export function isBeginnerSentence(targetText, nativeText) {
  if (!targetText || !nativeText) return false;
  if (targetText.length < 8 || targetText.length > 90) return false;
  if (nativeText.length > 120) return false;
  // Multiple sentence-enders usually means compound examples — skip.
  const enders = targetText.match(/[.!?。！？]/g) || [];
  if (enders.length > 1) return false;
  return true;
}

// Parse a whole pair file: filter, dedupe (by tatoebaId AND by normalized
// target text — Tatoeba has many near-duplicate translations), cap at limit.
export function parsePairFile(content, limit) {
  const seen = new Set();
  const seenText = new Set();
  const out = [];

  for (const line of content.split("\n")) {
    if (out.length >= limit) break;

    const parsed = parseAnkiLine(line);
    if (!parsed) continue;
    if (!isBeginnerSentence(parsed.targetText, parsed.nativeText)) continue;

    const textKey = parsed.targetText.toLowerCase();
    if (seen.has(parsed.tatoebaId) || seenText.has(textKey)) continue;
    seen.add(parsed.tatoebaId);
    seenText.add(textKey);
    out.push(parsed);
  }

  return out;
}
