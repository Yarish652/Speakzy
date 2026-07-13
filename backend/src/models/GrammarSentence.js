import mongoose from "mongoose";

// Tatoeba example-sentence corpus for the grammar tutor (docs/AI_ROADMAP.md
// Phase 4). One doc per sentence pair, ingested by scripts/ingest-tatoeba.js.
// Sentences are natural retrieval chunks — no chunking strategy needed.
//
// Licensing: Tatoeba sentences are CC-BY 2.0 FR — attribution required
// wherever they're shown (README + the explain modal both carry it).
const grammarSentenceSchema = new mongoose.Schema(
  {
    // Language pair key, "<targetLang>-<nativeLang>" in ISO 639-3 ("fra-eng").
    pair: { type: String, required: true, index: true },
    targetText: { type: String, required: true },
    nativeText: { type: String, required: true },
    // Tatoeba id of the TARGET-language sentence — citation links point to
    // https://tatoeba.org/en/sentences/show/<tatoebaId>
    tatoebaId: { type: Number, required: true },
    embedding: { type: [Number], default: undefined, select: false },
  },
  { timestamps: true }
);

grammarSentenceSchema.index({ pair: 1, tatoebaId: 1 }, { unique: true });

const GrammarSentence = mongoose.model("GrammarSentence", grammarSentenceSchema);

export default GrammarSentence;
