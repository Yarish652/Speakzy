import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SparklesIcon, CheckIcon, RefreshCwIcon, GraduationCapIcon } from "lucide-react";
import GrammarExplainModal from "./GrammarExplainModal";
import toast from "react-hot-toast";
import { getFlashcards, getNextFlashcards } from "../lib/api";
import useAuthUser from "../hooks/useAuthUser";
import { useStudyStats } from "../context/StudyStatsContext";
import { capitialize } from "../lib/utils";

const DAILY_LIMIT = 5;

const CATEGORY_EMOJI = {
  food: "🍎", travel: "✈️", family: "👨‍👩‍👧", university: "🎓", shopping: "🛍️",
  work: "💼", numbers: "🔢", greetings: "👋", emotions: "😊", body: "🫀",
  home: "🏠", time: "⏰",
};

function syncAuthUserFlashcardUsage(queryClient, remaining) {
  if (remaining == null) return;
  const newCount = DAILY_LIMIT - remaining;
  const today = new Date().toISOString().split("T")[0];
  queryClient.setQueryData(["authUser"], (old) => {
    if (!old?.user) return old;
    if (old.user.flashcardUsage?.count === newCount && old.user.flashcardUsage?.lastDate === today) {
      return old;
    }
    return {
      ...old,
      user: {
        ...old.user,
        flashcardUsage: {
          ...old.user.flashcardUsage,
          count: newCount,
          lastDate: today,
        },
      },
    };
  });
}

const FlashcardWidget = () => {
  const { authUser } = useAuthUser();
  const queryClient = useQueryClient();
  const { markWordStudied } = useStudyStats();
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [knownSet, setKnownSet] = useState(new Set());
  const [explaining, setExplaining] = useState(false);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["flashcards"],
    queryFn: getFlashcards,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (data?.remaining != null) {
      syncAuthUserFlashcardUsage(queryClient, data.remaining);
    }
  }, [data?.remaining, queryClient]);

  const { mutate: nextLessonMutation, isPending: isGeneratingNext } = useMutation({
    mutationFn: getNextFlashcards,
    onSuccess: (newData) => {
      queryClient.setQueryData(["flashcards"], newData);
      syncAuthUserFlashcardUsage(queryClient, newData.remaining);
      setCardIndex(0);
      setFlipped(false);
      setKnownSet(new Set());
    },
    onError: (err) => {
      if (err?.response?.status === 429) {
        queryClient.setQueryData(["flashcards"], (prev) => ({ ...prev, remaining: 0 }));
      } else {
        toast.error("Couldn't generate a new lesson. Please try again.");
      }
    },
  });

  const flashcards = data?.flashcards || [];
  const remaining = data?.remaining ?? null;
  const limitReached = (error?.response?.status === 429) || remaining === 0;
  const card = flashcards[cardIndex];

  const category = card?.category || flashcards[0]?.category || "";
  const emoji = CATEGORY_EMOJI[category?.toLowerCase()] || "📚";
  const known = knownSet.size;
  const total = flashcards.length || 5;

  const goNext = () => {
    setFlipped(false);
    setTimeout(() => setCardIndex((i) => (i + 1) % flashcards.length), 120);
  };

  const handleReveal = () => {
    markWordStudied(card);
    setFlipped(true);
  };

  const handleIKnewIt = () => {
    markWordStudied(card, { knewIt: true });
    setKnownSet((prev) => new Set(prev).add(cardIndex));
    goNext();
  };

  const handleReviewAgain = () => {
    goNext();
  };

  const handleNextLesson = () => {
    if (!isGeneratingNext) {
      nextLessonMutation();
    }
  };
    const topProgress =
      total > 0 ? Math.round((knownSet.size / total) * 100) : 0;

  return (
    <div className="rounded-[30px] border border-base-200/80 bg-base-100 p-6 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.2)] transition-shadow duration-200 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.24)]">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SparklesIcon className="size-4.5" />
          </span>
          <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-base-content">Daily Vocab</h2>
        </div>

        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-2 text-sm font-medium text-primary/90">
          <span>{emoji}</span>
          <span className="capitalize">{category}</span>
        </div>
      </div>

      {isLoading || isFetching ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/60">Generating your cards…</p>
        </div>
      ) : limitReached ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <span className="text-5xl">🌙</span>
          <h3 className="text-base font-semibold">All done for today!</h3>
          <p className="text-sm text-base-content/50 max-w-xs">You've completed today's lessons. Come back tomorrow for a fresh set.</p>
        </div>
      ) : card ? (
        <>
              <div className="mt-6">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-base-content/50">
              <span>Progress</span>
              <span className="font-semibold text-base-content">{known} / {total}</span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-base-200">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${topProgress}%` }} />
            </div>
          </div>

          <div className="mt-6 border-t border-base-200/80 pt-6">
            <div className="flex items-center justify-end gap-2 px-1 pb-3">
              {card.partOfSpeech && <span className="badge badge-ghost badge-sm capitalize px-3 py-2 text-[0.75rem]">{card.partOfSpeech}</span>}
              {card.difficulty && <span className="badge badge-success badge-sm px-3 py-2 text-[0.75rem]">{card.difficulty}</span>}
            </div>

            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-2 py-8 text-center sm:px-8 sm:py-9">
              <div className="flex justify-center">
                <span className="rounded-full bg-base-200 px-3 py-1 text-xs font-medium text-base-content/60">BOX {cardIndex + 1} OF {total}</span>
              </div>

              {!flipped ? (
                <>
                  <p className="text-3xl sm:text-[3.25rem] md:text-[3.5rem] font-semibold tracking-tight break-words">{card.targetWord}</p>
                  {card.romanization && <p className="text-sm tracking-normal text-base-content/60">{card.romanization}</p>}
                  <p className="text-xs text-base-content/50 mt-1.5">What does this mean in {capitialize(authUser?.nativeLanguage || "")}?</p>
                </>
              ) : (
                <>
                  <p className="text-2xl sm:text-[2.25rem] font-semibold text-primary">{card.nativeWord}</p>
                  <div className="w-14 h-px bg-base-content/20 my-2" />
                  {card.exampleTarget && <p className="text-sm italic text-base-content/70">"{card.exampleTarget}"</p>}
                  {card.exampleNative && <p className="text-xs text-base-content/40">{card.exampleNative}</p>}
                  {card.exampleTarget && (
                    <button className="btn btn-ghost btn-xs gap-1.5 mt-2 text-base-content/70 transition-colors duration-200 hover:text-base-content" onClick={() => setExplaining(true)}>
                      <GraduationCapIcon className="size-3.5" />
                      Why is this sentence built this way?
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="px-6 pb-6 w-full">
              <div className="flex flex-col gap-3">
                {!flipped ? (
                  <button className="btn btn-primary btn-lg w-full rounded-[18px] px-6 py-3.5 text-base font-semibold shadow-[0_8px_18px_-12px_rgba(99,102,241,0.35)] transition-all duration-200 hover:-translate-y-[0.5px] hover:shadow-[0_12px_24px_-14px_rgba(99,102,241,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100" onClick={handleReveal}>
                    Reveal answer
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button className="btn btn-outline btn-sm h-12 gap-1.5 rounded-[16px] px-4 transition-colors duration-200 hover:bg-base-100" onClick={handleReviewAgain}>
                      <RefreshCwIcon className="size-3.5" />
                      Review again
                    </button>
                    <button className="btn btn-success btn-sm h-12 gap-1.5 rounded-[16px] px-4 transition-colors duration-200 hover:bg-success/90" onClick={handleIKnewIt}>
                      <CheckIcon className="size-3.5" />
                      I knew it
                    </button>
                  </div>
                )}

                <button
                  className="btn btn-outline btn-lg w-full rounded-[18px] px-6 py-3.5 text-base font-semibold text-base-content transition-colors duration-200 hover:border-base-content/30 hover:bg-base-100 hover:text-base-content"
                  onClick={handleNextLesson}
                  disabled={isGeneratingNext}
                >
                  Next Lesson
                </button>
              </div>

              <div className="mt-5 border-t border-base-200 pt-3 text-center text-xs text-base-content/50">Right answers push it further out</div>
            </div>
          </div>

          <div className="mt-6 flex justify-center gap-2">
            {flashcards.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFlipped(false); setCardIndex(i); }}
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-200 ${knownSet.has(i) ? "bg-success" : i === cardIndex ? "bg-primary" : "bg-base-content/20"}`}
                aria-label={`Card ${i + 1}`}
              />
            ))}
          </div>
        </>
      ) : null}

      {isError && !limitReached && (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <p className="text-sm text-error">Failed to load cards. Please try again.</p>
          <button className="btn btn-sm btn-outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["flashcards"] })}>Retry</button>
        </div>
      )}

      {explaining && card?.exampleTarget && (
        <GrammarExplainModal sentence={card.exampleTarget} onClose={() => setExplaining(false)} />
      )}
    </div>
  );
};

export default FlashcardWidget;
