import useAuthUser from "../hooks/useAuthUser";
import FlashCardWidget from "../components/FlashCardWidget";
import ReviewWidget from "../components/ReviewWidget";
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
    <div className="p-4 sm:p-6 lg:p-8 min-h-full bg-gradient-to-b from-slate-50 to-white">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {getGreeting()}, {firstName} 👋
        </h1>
        <p className="text-sm text-slate-600 mt-1 font-medium">Welcome back. Keep up the great work!</p>
      </div>

      {/* Two-column layout — stacks on mobile, side-by-side on lg+ */}
      <div className="flex flex-col items-start gap-8 lg:flex-row lg:gap-10">
        {/* Flashcard + review deck — full width on mobile, capped on desktop */}
        <div className="flex w-full flex-col gap-5 lg:max-w-[43.5rem] lg:flex-[1.25] lg:min-w-0">
          <FlashCardWidget />
          <ReviewWidget />
        </div>

        {/* Stats aside */}
        <HomeAside />
      </div>
    </div>
  );
};

export default HomePage;
