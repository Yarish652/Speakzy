import useAuthUser from "../hooks/useAuthUser";
import FlashCardWidget from "../components/FlashCardWidget";
import HomeAside from "../components/HomeAside";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const HomePage = () => {
  const { authUser } = useAuthUser();
  const firstName = authUser?.fullName?.split(" ")[0] || "there";

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-full">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {getGreeting()}, {firstName} 👋
        </h1>
        <p className="text-sm text-base-content/50 mt-0.5">Welcome back. Keep up the great work!</p>
      </div>

      {/* Two-column layout — stacks on mobile, side-by-side on lg+ */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Flashcard — full width on mobile, capped on desktop */}
        <div className="w-full lg:flex-1 lg:min-w-0 lg:max-w-lg">
          <FlashCardWidget />
        </div>

        {/* Stats aside */}
        <HomeAside />
      </div>
    </div>
  );
};

export default HomePage;
