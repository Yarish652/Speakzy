import { Flame, BookOpen, Target, Users, Bell, ArrowRight } from "lucide-react";
import { Link } from "react-router";
import useAuthUser from "../hooks/useAuthUser";

const HomeAside = () => {
  const { authUser } = useAuthUser();

  const today = new Date().toISOString().split("T")[0];
  const usage = authUser?.flashcardUsage;
  const sessionsToday = usage?.lastDate === today ? usage.count : 0;
  const wordsToday = sessionsToday * 5;
  const dailyProgress = Math.round((sessionsToday / 5) * 100);

  const quickActions = [
    {
      icon: Target,
      label: "Continue lesson",
      desc: sessionsToday < 5 ? `${5 - sessionsToday} session${5 - sessionsToday !== 1 ? "s" : ""} left today` : "All done for today!",
      to: "/",
    },
    {
      icon: Users,
      label: "Find partners",
      desc: "Meet new language learners",
      to: "/friends",
    },
    {
      icon: Bell,
      label: "Friend requests",
      desc: "Check pending requests",
      to: "/notifications",
    },
  ];

  return (
    <aside className="flex flex-col gap-4 w-full lg:w-72 lg:shrink-0">

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-base-200 border border-base-300 p-4">
          <Flame className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-semibold tracking-tight">{sessionsToday}</p>
          <p className="text-xs text-base-content/50">Sessions today</p>
        </div>
        <div className="rounded-2xl bg-base-200 border border-base-300 p-4">
          <BookOpen className="size-5 text-primary" />
          <p className="mt-3 text-2xl font-semibold tracking-tight">{wordsToday}</p>
          <p className="text-xs text-base-content/50">Words studied</p>
        </div>
      </div>

      {/* Daily goal */}
      <div className="rounded-2xl bg-base-200 border border-base-300 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Daily goal</h3>
          <span className="text-xs text-base-content/50">{sessionsToday} / 5 sessions</span>
        </div>
        <div className="h-2 w-full rounded-full bg-base-300 overflow-hidden">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${dailyProgress}%` }}
          />
        </div>
        <p className="mt-3 text-xs text-base-content/50">
          {sessionsToday === 0
            ? "Start your first lesson to hit today's goal."
            : sessionsToday < 5
            ? `${5 - sessionsToday} more session${5 - sessionsToday !== 1 ? "s" : ""} to hit today's goal.`
            : "You've hit your daily goal. Great work!"}
        </p>
      </div>

      {/* Quick actions */}
      <div className="rounded-2xl bg-base-200 border border-base-300 p-2">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className="flex items-center gap-3 rounded-xl p-3 hover:bg-base-300 transition-colors"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-base-300">
              <action.icon className="size-4 text-base-content/70" />
            </span>
            <span className="flex-1 leading-tight min-w-0">
              <span className="block text-sm font-medium">{action.label}</span>
              <span className="block text-xs text-base-content/50 truncate">{action.desc}</span>
            </span>
            <ArrowRight className="size-4 text-base-content/30 shrink-0" />
          </Link>
        ))}
      </div>

    </aside>
  );
};

export default HomeAside;
