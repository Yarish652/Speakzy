import { createContext, useContext, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTodayStudy, recordStudyEvent } from "../lib/api";
import useAuthUser from "../hooks/useAuthUser";

// "Words studied" is server-backed: every reveal / "I knew it" posts a study
// event, and the StudiedWord collection is the source of truth. That makes
// the count account-level — the same on every device — and gives the backend
// the study history that personalized flashcard generation retrieves from
// (docs/AI_ROADMAP.md Phase 2). This context hydrates today's studied words
// once per session and layers an optimistic local Set on top so the
// HomeAside tile updates instantly on reveal, without waiting for a refetch.

const StudyStatsContext = createContext(null);

// Must mirror the backend's wordKey normalization (StudiedWord.wordKey).
const keyFor = (word) => (typeof word === "string" ? word.trim().toLowerCase() : "");

export function StudyStatsProvider({ children }) {
  const { authUser } = useAuthUser();
  const [localKeys, setLocalKeys] = useState(() => new Set());

  const { data } = useQuery({
    queryKey: ["studyToday"],
    queryFn: getTodayStudy,
    enabled: !!authUser,
    staleTime: 5 * 60 * 1000, // refetches keep the count fresh across devices
  });

  const wordsStudied = new Set([...(data?.wordKeys || []), ...localKeys]).size;

  // card: { targetWord, nativeWord, category }. knewIt marks the stronger
  // "I knew it" signal; a plain reveal counts as studying the word.
  const markWordStudied = useCallback((card, { knewIt = false } = {}) => {
    const key = keyFor(card?.targetWord);
    if (!key) return;

    setLocalKeys((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));

    // Fire-and-forget: recording a stat should never interrupt studying.
    // The card snapshot (examples, romanization) is stored server-side so
    // the revision deck can replay real cards without regenerating them.
    recordStudyEvent({
      targetWord: card.targetWord,
      nativeWord: card.nativeWord || "",
      category: card.category || "",
      knewIt,
      exampleTarget: card.exampleTarget || undefined,
      exampleNative: card.exampleNative || undefined,
      romanization: card.romanization || undefined,
      partOfSpeech: card.partOfSpeech || undefined,
    }).catch(() => {});
  }, []);

  return (
    <StudyStatsContext.Provider value={{ wordsStudied, markWordStudied }}>
      {children}
    </StudyStatsContext.Provider>
  );
}

export function useStudyStats() {
  const ctx = useContext(StudyStatsContext);
  if (!ctx) throw new Error("useStudyStats must be used within a StudyStatsProvider");
  return ctx;
}
