import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SparklesIcon, RotateCcwIcon, CheckIcon, RefreshCwIcon } from "lucide-react";
import { getFlashcards } from "../lib/api";
import useAuthUser from "../hooks/useAuthUser";
import { capitialize } from "../lib/utils";

const CATEGORY_EMOJI = {
  food: "🍎",
  travel: "✈️",
  family: "👨‍👩‍👧",
  university: "🎓",
  shopping: "🛍️",
  work: "💼",
  numbers: "🔢",
  greetings: "👋",
  emotions: "😊",
  body: "🫀",
  home: "🏠",
  time: "⏰",
};

const FlashcardWidget = () => {
  const { authUser } = useAuthUser();
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownSet, setKnownSet] = useState(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["flashcards", refreshKey],
    queryFn: getFlashcards,
    retry: false,
    staleTime: Infinity,
  });

  const flashcards = data?.flashcards || [];
  const remaining = data?.remaining ?? null;
  const limitReached = error?.response?.status === 429;
  const card = flashcards[cardIndex];

  const category = card?.category || flashcards[0]?.category || "";
  const emoji = CATEGORY_EMOJI[category?.toLowerCase()] || "📚";
  const known = knownSet.size;
  const total = flashcards.length || 5;
  const progress = total > 0 ? Math.round((known / total) * 100) : 0;

  const goNext = () => {
    setFlipped(false);
    setTimeout(() => setCardIndex((i) => (i + 1) % flashcards.length), 120);
  };

  const handleIKnewIt = () => {
    setKnownSet((prev) => new Set(prev).add(cardIndex));
    goNext();
  };

  const handleReviewAgain = () => {
    goNext();
  };

  const handleNextLesson = () => {
    setCardIndex(0);
    setFlipped(false);
    setKnownSet(new Set());
    setRefreshKey((k) => k + 1);
  };

  const canNextLesson = remaining === null || remaining > 0;

  return (
    <div className="card bg-base-200 p-5 gap-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-5 text-primary" />
        <h2 className="font-bold text-lg">Daily Vocab</h2>
      </div>

      {/* Loading */}
      {(isLoading || isFetching) && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/50">Generating your cards...</p>
        </div>
      )}

      {/* Daily limit reached */}
      {!isFetching && limitReached && (
        <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
          <span className="text-5xl">🌙</span>
          <h3 className="text-base font-semibold">All done for today!</h3>
          <p className="text-sm text-base-content/50 max-w-xs">
            You've completed today's lessons. Come back tomorrow for a fresh set.
          </p>
        </div>
      )}

      {/* Cards */}
      {!isLoading && !isFetching && !limitReached && card && (
        <>
          {/* Category pill + progress counter */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-base-300 px-3 py-1 text-sm font-medium">
              <span>{emoji}</span>
              <span className="capitalize">{category}</span>
            </span>
            <span className="text-sm text-base-content/50 tabular-nums">
              <span className="text-base-content font-semibold">{known}</span>
              <span className="text-base-content/40"> / {total}</span>
            </span>
          </div>

          {/* Green progress bar */}
          <div className="h-1.5 w-full rounded-full bg-base-300 overflow-hidden -mt-2">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Card face */}
          <div className="rounded-2xl bg-base-300 overflow-hidden">
            {/* Card meta bar */}
            <div className="flex items-center justify-end gap-1.5 px-4 py-2.5 border-b border-base-content/10">
              {card.partOfSpeech && (
                <span className="badge badge-ghost badge-xs capitalize">{card.partOfSpeech}</span>
              )}
              {card.difficulty && (
                <span className="badge badge-success badge-xs">{card.difficulty}</span>
              )}
            </div>

            {/* Card body */}
            <div className="flex flex-col items-center justify-center px-6 py-10 text-center min-h-48 gap-2">
              {!flipped ? (
                <>
                  <p className="text-4xl font-bold tracking-tight">{card.targetWord}</p>
                  {card.romanization && (
                    <p className="text-sm italic text-base-content/50">{card.romanization}</p>
                  )}
                  <p className="text-xs text-base-content/40 mt-2">
                    What does this mean in {capitialize(authUser?.nativeLanguage || "")}?
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold text-primary">{card.nativeWord}</p>
                  <div className="w-10 h-px bg-base-content/20 my-1" />
                  {card.exampleTarget && (
                    <p className="text-sm italic text-base-content/70">"{card.exampleTarget}"</p>
                  )}
                  {card.exampleNative && (
                    <p className="text-xs text-base-content/40">{card.exampleNative}</p>
                  )}
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="px-4 pb-4">
              {!flipped ? (
                <button className="btn btn-primary w-full" onClick={() => setFlipped(true)}>
                  Reveal answer
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn btn-outline btn-sm gap-1.5"
                    onClick={handleReviewAgain}
                  >
                    <RefreshCwIcon className="size-3.5" />
                    Review again
                  </button>
                  <button
                    className="btn btn-success btn-sm gap-1.5"
                    onClick={handleIKnewIt}
                  >
                    <CheckIcon className="size-3.5" />
                    I knew it
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Dots nav */}
          <div className="flex justify-center gap-1.5">
            {flashcards.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFlipped(false); setCardIndex(i); }}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  knownSet.has(i)
                    ? "bg-success w-4"
                    : i === cardIndex
                    ? "bg-base-content/50 w-4"
                    : "bg-base-content/20 w-2"
                }`}
              />
            ))}
          </div>

          {/* Next Lesson */}
          <button
            className="btn btn-outline btn-sm w-full gap-2"
            onClick={handleNextLesson}
            disabled={!canNextLesson}
          >
            <RotateCcwIcon className="size-3.5" />
            {canNextLesson ? "Next Lesson" : "Come back tomorrow"}
          </button>
        </>
      )}

      {/* Generic error */}
      {isError && !limitReached && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <p className="text-sm text-error">Failed to load cards. Please try again.</p>
          <button className="btn btn-sm btn-outline" onClick={handleNextLesson}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default FlashcardWidget;
