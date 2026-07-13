// App language names (free-text from onboarding, lowercased) -> ISO 639-3
// codes, which Tatoeba uses for its corpora. Unknown languages return null:
// the grammar tutor then answers without corpus citations instead of failing.
const LANG_CODES = {
  english: "eng",
  french: "fra",
  spanish: "spa",
  german: "deu",
  italian: "ita",
  portuguese: "por",
  hindi: "hin",
  japanese: "jpn",
  chinese: "cmn",
  mandarin: "cmn",
  korean: "kor",
  russian: "rus",
  arabic: "ara",
  greek: "ell",
  thai: "tha",
  dutch: "nld",
  turkish: "tur",
};

export function langCode(languageName) {
  return LANG_CODES[(languageName || "").toLowerCase().trim()] || null;
}

// "fra-eng" — target language first, matching GrammarSentence.pair.
export function pairKey(targetLanguageName, nativeLanguageName) {
  const target = langCode(targetLanguageName);
  const native = langCode(nativeLanguageName);
  if (!target || !native) return null;
  return `${target}-${native}`;
}
