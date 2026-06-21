import { SparklesIcon } from "lucide-react";

const FlashcardWidget = () => {
  return (
    <div className="card bg-base-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <SparklesIcon className="size-5 text-primary" />
        <h2 className="text-xl font-bold">Daily Vocab Cards</h2>
        <span className="badge badge-warning badge-sm ml-1">Coming Soon</span>
      </div>

      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="text-5xl">🚧</div>
        <h3 className="text-lg font-semibold">This feature is under works!</h3>
        <p className="text-sm text-base-content/60 max-w-sm">
          AI-powered vocabulary flashcards are on their way. For now, enjoy chatting and learning with your language partners!
        </p>
      </div>
    </div>
  );
};

export default FlashcardWidget;
