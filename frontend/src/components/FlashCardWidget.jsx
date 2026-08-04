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
    <div className="hero-card hero-card-content">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SparklesIcon className="size-6 text-white" />
          <h2 className="font-bold text-xl text-white">Daily Vocab</h2>
        </div>
      </div>
 
      {(isLoading || isFetching) && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="loading loading-spinner loading-lg text-white" />
          <p className="text-sm text-white/70">Generating your cards...</p>
        </div>
      )}
 
      {!isFetching && limitReached && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <span className="text-5xl">🌙</span>
          <h3 className="text-lg font-semibold text-white">All done for today!</h3>
          <p className="text-sm text-white/70 max-w-xs">
            You've completed today's lessons. Come back tomorrow for a fresh set.
          </p>
        </div>
      ) : card ? (
        <>
          <div className="flex items-center justify-between">
            <span className="badge-premium">
              <span className="text-lg">{emoji}</span>
              <span className="capitalize font-medium">{category}</span>
            </span>
            <span className="text-sm text-white/70 tabular-nums">
              <span className="text-white font-semibold">{known}</span>
              <span className="text-white/50"> / {total}</span>
            </span>
          </div>
 
          <div className="progress-premium h-2 w-full">
            <div
              className="progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
 
          <div className="card-hero-section">
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-b border-white/10">
              {card.partOfSpeech && (
                <span className="text-xs font-medium text-white/80 bg-white/10 px-2.5 py-1 rounded-lg capitalize">{card.partOfSpeech}</span>
              )}
              {card.difficulty && (
                <span className="text-xs font-medium text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-lg">{card.difficulty}</span>
              )}
            </div>
 
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center min-h-56 gap-3">
              {!flipped ? (
                <>
                  <p className="card-hero-word">{card.targetWord}</p>
                  {card.romanization && (
                    <p className="text-sm italic text-white/60">{card.romanization}</p>
                  )}
                  <p className="text-xs text-white/50 mt-2">
                    What does this mean in {capitialize(authUser?.nativeLanguage || "")}?
                  </p>
                </>
              ) : (
                <>
                  <p className="text-4xl font-bold text-emerald-300">{card.nativeWord}</p>
                  <div className="w-12 h-px bg-white/20 my-2" />
                  {card.exampleTarget && (
                    <p className="text-sm italic text-white/70">"{card.exampleTarget}"</p>
                  )}
                  {card.exampleNative && (
                    <p className="text-xs text-white/50">{card.exampleNative}</p>
                  )}
                  {card.exampleTarget && (
                    <button
                      className="btn btn-ghost btn-xs gap-1.5 mt-2 text-white/60 hover:text-white hover:bg-white/10"
                      onClick={() => setExplaining(true)}
                    >
                      <GraduationCapIcon className="size-4" />
                      Why is this sentence built this way?
                    </button>
                  )}
                </>
              )}
            </div>
 
            <div className="px-5 pb-5">
              {!flipped ? (
                <button className="btn-premium-primary w-full btn-sm" onClick={handleReveal}>
                  Reveal answer
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn btn-sm btn-outline gap-1.5 bg-white/10 border-white/30 text-white hover:bg-white/20 hover:border-white/40" onClick={handleReviewAgain}>
                    <RefreshCwIcon className="size-4" />
                    Review again
                  </button>
                  <button className="btn btn-sm gap-1.5 bg-emerald-500 hover:bg-emerald-600 border-0 text-white font-medium" onClick={handleIKnewIt}>
                    <CheckIcon className="size-4" />
                    I knew it
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
 
          <div className="flex justify-center gap-2">
            {flashcards.map((_, i) => (
              <button
                key={i}
                onClick={() => { setFlipped(false); setCardIndex(i); }}
                className={`h-2 rounded-full transition-all duration-300 ${
                  knownSet.has(i)
                    ? "bg-emerald-400 w-6"
                    : i === cardIndex
                    ? "bg-white/70 w-6"
                    : "bg-white/30 w-2.5"
                }`}
              />
            ))}
          </div>
 
          <button
            className="btn btn-outline btn-sm w-full gap-2 border-white/30 text-white hover:bg-white/10 hover:border-white/50 font-medium"
            onClick={handleNextLesson}
            disabled={!canNextLesson}
          >
            {isGeneratingNext ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <RotateCcwIcon className="size-4" />
            )}
            {canNextLesson ? "Next Lesson" : "Come back tomorrow"}
          </button>
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
