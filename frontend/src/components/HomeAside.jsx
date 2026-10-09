import { Flame, BookOpen, Target, Users, Bell, ArrowRight } from "lucide-react";
import { Link } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { useStudyStats } from "../context/StudyStatsContext";

const HomeAside = () => {
  const { authUser } = useAuthUser();
  const { wordsStudied } = useStudyStats();

  const today = new Date().toISOString().split("T")[0];
  const usage = authUser?.flashcardUsage;
  const sessionsToday = usage?.lastDate === today ? usage.count : 0;
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
    <aside className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="relative flex flex-col items-start gap-3 rounded-[24px] border border-base-200/80 bg-base-100 p-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.16)]">
          <div className="absolute right-4 top-4 text-[10px] uppercase tracking-[0.24em] text-base-content/40">Today</div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Flame className="size-4" />
          </div>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.02em]">{sessionsToday}</p>
          <p className="text-xs text-base-content/50">Sessions today</p>
        </div>
        <div className="relative flex flex-col items-start gap-3 rounded-[24px] border border-base-200/80 bg-base-100 p-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.16)]">
          <div className="absolute right-4 top-4 text-[10px] uppercase tracking-[0.24em] text-base-content/40">Total</div>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen className="size-4" />
          </div>
          <p className="mt-2 text-[1.7rem] font-semibold tracking-[-0.02em]">{wordsStudied}</p>
          <p className="text-xs text-base-content/50">Words studied</p>
        </div>
      </div>

      {/* Daily goal */}
      <div className="rounded-[24px] border border-base-200/80 bg-base-100 p-5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.16)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">Daily goal</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-sm text-base-content/50">{sessionsToday} / 5 sessions</span>
            <span className="text-sm font-semibold text-success">{dailyProgress}%</span>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-base-200">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${dailyProgress}%` }}
          />
        </div>
        <p className="mt-4 text-xs leading-5 text-base-content/50">
          {sessionsToday === 0
            ? "Start your first lesson to hit today's goal."
            : sessionsToday < 5
            ? `${5 - sessionsToday} more session${5 - sessionsToday !== 1 ? "s" : ""} to hit today's goal.`
            : "You've hit your daily goal. Great work!"}
        </p>
      </div>

      {/* Quick actions */}
      <div className="rounded-[24px] border border-base-200/80 bg-base-100 p-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.16)]">
        <h4 className="mb-3 text-sm font-semibold">Quick Actions</h4>
        <div className="flex flex-col divide-y divide-base-200">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="group flex items-center gap-3 rounded-2xl p-3.5 transition duration-200 hover:bg-base-100 hover:shadow-md"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-base-200/70 text-base-content/80 transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
                <action.icon className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{action.label}</div>
                <div className="text-xs text-base-content/50 truncate">{action.desc}</div>
              </div>
              <span className="text-base-content/30 text-lg leading-none transition-colors duration-200 group-hover:text-base-content/60">›</span>
            </Link>
          ))}
        </div>
      </div>

    </aside>
  );
};

export default HomeAside;
