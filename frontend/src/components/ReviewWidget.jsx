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
      <div className="rounded-[30px] border border-base-200/80 bg-base-100 p-6 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.2)]">
        <div className="flex items-center gap-2">
          <BrainIcon className="size-5 text-secondary" />
          <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-base-content">Review</h2>
        </div>
        <div className="flex justify-center py-10">
          <span className="loading loading-spinner text-secondary" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[30px] border border-base-200/80 bg-base-100 p-6 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.2)] transition-shadow duration-200 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.24)]">
      <div className="flex items-center justify-between gap-3 border-b border-base-200/80 pb-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
            <BrainIcon className="size-5" />
          </span>
          <h2 className="text-[1.3rem] font-semibold tracking-[-0.02em] text-base-content">Review</h2>
        </div>
        {remaining > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary/10 px-3.5 py-2 text-sm font-semibold text-secondary/90 tabular-nums">{remaining} due</span>
        )}
      </div>

      {!card ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <span className="text-4xl">✅</span>
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-base-content/50 max-w-xs leading-5">
            Words you study come back here for review — first after a day, then at growing
            intervals as you get them right.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <div className="flex min-h-[165px] flex-col items-center gap-3 px-2 py-8 text-center sm:px-8">
              {!flipped ? (
                <>
                  <p className="break-words text-3xl font-semibold tracking-[-0.03em] text-base-content sm:text-[3.25rem]">{card.targetWord}</p>
                  {card.romanization && (
                    <p className="text-sm tracking-normal text-base-content/60">{card.romanization}</p>
                  )}
                  <p className="text-xs text-base-content/50 mt-1.5">Do you remember this word?</p>
                </>
              ) : (
                <>
                  <p className="text-3xl sm:text-4xl font-semibold text-secondary">{card.nativeWord || "—"}</p>
                  {card.exampleTarget && (
                    <p className="text-sm italic text-base-content/70 mt-2">"{card.exampleTarget}"</p>
                  )}
                  {card.exampleNative && (
                    <p className="text-xs text-base-content/40">{card.exampleNative}</p>
                  )}
                </>
              )}
            </div>

            <div className="mt-5 border-t border-base-200/80 px-6 pt-5 pb-5">
              <div className="flex flex-col gap-3">
                {!flipped ? (
                  <button className="btn btn-secondary btn-lg w-full rounded-[18px] px-6 py-3.5 text-base font-semibold shadow-[0_8px_18px_-12px_rgba(219,39,119,0.12)] transition-all duration-200 hover:-translate-y-[0.5px] hover:shadow-[0_12px_24px_-14px_rgba(219,39,119,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100" onClick={() => setFlipped(true)}>
                    Show answer
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      className="btn btn-outline btn-sm h-12 gap-1.5 rounded-[16px] px-4 transition-colors duration-200 hover:bg-base-100"
                      disabled={isPending}
                      onClick={() => answer(false)}
                    >
                      <XIcon className="size-3.5" />
                      Forgot
                    </button>
                    <button
                      className="btn btn-success btn-sm h-12 gap-1.5 rounded-[16px] px-4 transition-colors duration-200 hover:bg-success/90"
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
          </div>

          <p className="mt-4 text-center text-xs text-base-content/40">
            Box {card.box} of 5 — right answers push it further out
          </p>
        </>
      )}
    </div>
  );
};

export default ReviewWidget;
