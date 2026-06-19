import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axiosInstance } from "../lib/axios";
import { SparklesIcon, RotateCcwIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";

const getFlashcards = async () => {
  const res = await axiosInstance.get("/ai/flashcards");
  return res.data.flashcards;
};

const FlashcardWidget = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [score, setScore] = useState({ got: 0, learning: 0 });
  const [finished, setFinished] = useState(false);

  const { data: flashcards, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["flashcards"],
    queryFn: getFlashcards,
    staleTime: Infinity,
  });

  const handleFlip = () => setIsFlipped(!isFlipped);

  const handleAnswer = (gotIt) => {
    setScore((prev) => ({
      got: gotIt ? prev.got + 1 : prev.got,
      learning: gotIt ? prev.learning : prev.learning + 1,
    }));
    if (currentIndex + 1 >= flashcards.length) {
      setFinished(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
      setIsFlipped(false);
    }
  };

  const handlePlayAgain = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setScore({ got: 0, learning: 0 });
    setFinished(false);
    refetch();
  };

  if (isLoading || isFetching) {
    return (
      <div className="card bg-base-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <SparklesIcon className="size-5 text-primary" />
          <h2 className="text-xl font-bold">Daily Vocab Cards</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/60">Generating flashcards...</p>
        </div>
      </div>
    );
  }

  if (!flashcards || flashcards.length === 0) return null;

  const card = flashcards[currentIndex];

  return (
    <div className="card bg-base-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-5 text-primary" />
          <h2 className="text-xl font-bold">Daily Vocab Cards</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="badge badge-success gap-1">
            <CheckCircleIcon className="size-3" /> {score.got}
          </span>
          <span className="badge badge-error gap-1">
            <XCircleIcon className="size-3" /> {score.learning}
          </span>
          <span className="badge badge-ghost">
            {currentIndex + 1}/{flashcards.length}
          </span>
        </div>
      </div>

      {/* Progress */}
      <progress
        className="progress progress-primary w-full mb-6"
        value={currentIndex}
        max={flashcards.length}
      />

      {!finished ? (
        <>
          {/* Flashcard flip */}
          <div
            className="cursor-pointer mb-4"
            style={{ perspective: "1000px" }}
            onClick={handleFlip}
          >
            <div
              style={{
                position: "relative",
                height: "220px",
                transformStyle: "preserve-3d",
                transition: "transform 0.5s ease",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}
            >
              {/* Front */}
              <div
                className="absolute inset-0 rounded-2xl bg-primary flex flex-col items-center justify-center p-6 gap-2"
                style={{ backfaceVisibility: "hidden" }}
              >
                <span className="badge badge-outline text-primary-content border-primary-content/30 text-xs">
                  {card.word && "vocabulary"}
                </span>
                <p className="text-5xl font-bold text-primary-content text-center">
                  {card.word}
                </p>
                <p className="text-primary-content/60 text-sm mt-2">
                  Tap to reveal translation
                </p>
              </div>

              {/* Back */}
              <div
                className="absolute inset-0 rounded-2xl bg-secondary flex flex-col items-center justify-center p-6 gap-2"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <span className="badge badge-outline text-secondary-content border-secondary-content/30 text-xs">
                  translation
                </span>
                <p className="text-3xl font-bold text-secondary-content text-center">
                  {card.translation}
                </p>
                <div className="divider my-1 w-16 mx-auto" />
                <p className="text-sm italic text-secondary-content/80 text-center">
                  {card.exampleSentence}
                </p>
                <p className="text-xs text-secondary-content/60 text-center">
                  {card.exampleTranslation}
                </p>
              </div>
            </div>
          </div>

          {/* Answer buttons */}
          {isFlipped && (
            <div className="flex gap-3">
              <button
                className="btn btn-error btn-outline flex-1"
                onClick={() => handleAnswer(false)}
              >
                <XCircleIcon className="size-4" /> Still Learning
              </button>
              <button
                className="btn btn-success btn-outline flex-1"
                onClick={() => handleAnswer(true)}
              >
                <CheckCircleIcon className="size-4" /> Got It
              </button>
            </div>
          )}

          {!isFlipped && (
            <p className="text-center text-xs text-base-content/40 mt-2">
              Tap the card to see the answer
            </p>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
          <div className="text-5xl">🎉</div>
          <h3 className="text-xl font-bold">Round Complete!</h3>
          <p className="text-base-content/70">
            You got{" "}
            <span className="text-success font-bold">{score.got}</span> out of{" "}
            <span className="font-bold">{flashcards.length}</span> correct
          </p>
          <button className="btn btn-primary gap-2" onClick={handlePlayAgain}>
            <RotateCcwIcon className="size-4" /> Play Again
          </button>
        </div>
      )}
    </div>
  );
};

export default FlashcardWidget;