import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BrainIcon, CheckIcon, XIcon } from "lucide-react";
import { getReviewCards, submitReviewResult } from "../lib/api";

// Leitner revision deck: replays words you've studied, spaced so each word
// comes back right around when you'd forget it. Entirely DB-driven — no LLM
// calls, so it's instant and free.
const ReviewWidget = () => {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["reviewCards"],
    queryFn: getReviewCards,
    staleTime: 60 * 1000,
  });

  const { mutate: sendResult, isPending } = useMutation({
    mutationFn: submitReviewResult,
    onSuccess: () => {
      // Reviews bump study counters server-side; keep the aside in sync.
      queryClient.invalidateQueries({ queryKey: ["studyToday"] });
    },
  });

  const cards = data?.cards || [];
  const card = cards[index];
  const remaining = cards.length - index;

  const answer = (correct) => {
    if (!card || isPending) return;
    sendResult({ targetWord: card.targetWord, correct });
    setFlipped(false);
    if (index + 1 >= cards.length) {
      // Batch finished — refetch in case more cards are due.
      setIndex(0);
      queryClient.invalidateQueries({ queryKey: ["reviewCards"] });
    } else {
      setIndex(index + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="card bg-base-200 p-5 gap-4">
        <div className="flex items-center gap-2">
          <BrainIcon className="size-5 text-secondary" />
          <h2 className="font-bold text-lg">Review</h2>
        </div>
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner text-secondary" />
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-200 p-5 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrainIcon className="size-5 text-secondary" />
          <h2 className="font-bold text-lg">Review</h2>
        </div>
        {remaining > 0 && (
          <span className="badge badge-secondary badge-outline tabular-nums">{remaining} due</span>
        )}
      </div>

      {!card ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <span className="text-4xl">✅</span>
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-base-content/50 max-w-xs">
            Words you study come back here for review — first after a day, then at growing
            intervals as you get them right.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-base-300 overflow-hidden">
            <div className="flex flex-col items-center justify-center px-6 py-8 text-center min-h-36 gap-2">
              {!flipped ? (
                <>
                  <p className="text-3xl font-bold tracking-tight">{card.targetWord}</p>
                  {card.romanization && (
                    <p className="text-sm italic text-base-content/50">{card.romanization}</p>
                  )}
                  <p className="text-xs text-base-content/40 mt-1">Do you remember this word?</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-secondary">{card.nativeWord || "—"}</p>
                  {card.exampleTarget && (
                    <p className="text-sm italic text-base-content/70 mt-1">"{card.exampleTarget}"</p>
                  )}
                  {card.exampleNative && (
                    <p className="text-xs text-base-content/40">{card.exampleNative}</p>
                  )}
                </>
              )}
            </div>

            <div className="px-4 pb-4">
              {!flipped ? (
                <button className="btn btn-secondary btn-sm w-full" onClick={() => setFlipped(true)}>
                  Show answer
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className="btn btn-outline btn-sm gap-1.5"
                    disabled={isPending}
                    onClick={() => answer(false)}
                  >
                    <XIcon className="size-3.5" />
                    Forgot
                  </button>
                  <button
                    className="btn btn-success btn-sm gap-1.5"
                    disabled={isPending}
                    onClick={() => answer(true)}
                  >
                    <CheckIcon className="size-3.5" />
                    Got it
                  </button>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-base-content/40">
            Box {card.box} of 5 — right answers push it further out
          </p>
        </>
      )}
    </div>
  );
};

export default ReviewWidget;
