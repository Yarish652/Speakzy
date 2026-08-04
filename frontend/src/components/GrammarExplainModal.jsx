import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { XIcon, GraduationCapIcon, ExternalLinkIcon } from "lucide-react";
import { explainSentence } from "../lib/api";

// Grammar tutor modal: RAG-grounded explanation of a flashcard's example
// sentence, with citations to similar Tatoeba sentences. Citations are
// CC-BY - the attribution footer is a license requirement, don't remove it.



const GrammarExplainModal = ({ sentence, onClose }) => {
  const [question, setQuestion] = useState("");

  const {
    mutate: ask,
    data,
    isPending,
    error,
  } = useMutation({ mutationFn: explainSentence });

  useEffect(() => {
  console.log("Mutation state:", {
    isPending,
    data,
    error,
  });
}, [isPending, data, error]);



  // Auto-explain once on mount. Ref-guarded so StrictMode's double-invoked
  // effects can't fire two quota-consuming requests.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    askedRef.current = true;
    ask({ sentence });
  }, [ask, sentence]);

  const limitReached = error?.response?.status === 429;

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box max-w-lg">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2">
            <GraduationCapIcon className="size-5 text-primary" />
            <h3 className="font-bold text-lg">Grammar tutor</h3>
          </div>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <XIcon className="size-4" />
          </button>
        </div>

        <p className="text-sm italic text-base-content/70 mb-4">"{sentence}"</p>

        {isPending && (
          <div className="flex items-center gap-3 py-6 justify-center">
            <span className="loading loading-spinner text-primary" />
            <span className="text-sm text-base-content/50">Thinking about the grammar...</span>
          </div>
        )}

        {limitReached && (
          <p className="py-4 text-sm text-center text-base-content/60">
            You've used today's explanations. Come back tomorrow!
          </p>
        )}

        {error && !limitReached && (
          <p className="py-4 text-sm text-center text-error">
            Couldn't reach the grammar tutor. Please try again.
          </p>
        )}

        {data && !isPending && (
          <>
            <div className="whitespace-pre-line text-sm leading-relaxed">{data.explanation}</div>

            {data.citations?.length > 0 && (
              <div className="mt-4 rounded-xl bg-base-200 p-3">
                <p className="text-xs font-semibold text-base-content/60 mb-2">Similar examples</p>
                <ul className="flex flex-col gap-1.5">
                  {data.citations.map((c) => (
                    <li key={c.tatoebaId} className="text-xs leading-snug">
                      <a
                        href={`https://tatoeba.org/en/sentences/show/${c.tatoebaId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="link link-hover inline-flex items-center gap-1"
                      >
                        <span className="font-medium">{c.targetText}</span>
                        <ExternalLinkIcon className="size-3 shrink-0 text-base-content/40" />
                      </a>
                      <span className="text-base-content/50"> — {c.nativeText}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && question.trim() && ask({ sentence, question })}
                placeholder="Ask a follow-up about this sentence (optional)"
                maxLength={200}
                className="input input-bordered input-sm flex-1"
              />
              <button
                className="btn btn-primary btn-sm"
                disabled={!question.trim() || isPending}
                onClick={() => ask({ sentence, question })}
              >
                Ask
              </button>
            </div>

            {typeof data.remaining === "number" && (
              <p className="mt-2 text-right text-xs text-base-content/40 tabular-nums">
                {data.remaining} explanations left today
              </p>
            )}
          </>
        )}

        <p className="mt-4 text-[11px] text-base-content/40">
          Example sentences from{" "}
          <a href="https://tatoeba.org" target="_blank" rel="noreferrer" className="link link-hover">
            Tatoeba
          </a>{" "}
          contributors, CC-BY 2.0 FR.
        </p>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
};

export default GrammarExplainModal;
