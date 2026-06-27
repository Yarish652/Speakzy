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

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* Left — flashcard (grows to fill space) */}
        <div className="flex-1 min-w-0 max-w-lg">
          <FlashCardWidget />
        </div>

        {/* Right — stats aside */}
        <HomeAside />
      </div>
    </div>
  );
};

export default HomePage;
