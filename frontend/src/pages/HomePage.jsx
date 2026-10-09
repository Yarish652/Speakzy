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
    <div className="mx-auto min-h-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* Greeting */}
      <div className="mb-8 max-w-3xl sm:mb-10">
        <h1 className="text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-base-content sm:text-5xl">
          {getGreeting()}, {firstName} 👋
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-base-content/60 sm:text-[0.95rem]">
          Welcome back. Keep up the great work!
        </p>
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
