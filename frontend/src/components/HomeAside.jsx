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

      {/* Stats grid — varied styling */}
      <div className="grid grid-cols-2 gap-4">
        <div className="stat-card-primary">
          <Flame className="size-5 text-indigo-600" />
          <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{sessionsToday}</p>
          <p className="text-xs text-slate-600 font-medium mt-1">Sessions today</p>
        </div>
        <div className="stat-card-secondary">
          <BookOpen className="size-5 text-indigo-600" />
          <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{wordsStudied}</p>
          <p className="text-xs text-slate-600 font-medium mt-1">Words studied</p>
        </div>
      </div>

      {/* Daily goal */}
      <div className="surface-elevated p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Daily goal</h3>
          <span className="text-xs font-semibold text-slate-600">{sessionsToday} / 5 sessions</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden shadow-sm">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 shadow-md"
            style={{ width: `${dailyProgress}%` }}
          />
        </div>
        <p className="mt-4 text-xs text-slate-600 leading-relaxed">
          {sessionsToday === 0
            ? "Start your first lesson to hit today's goal."
            : sessionsToday < 5
            ? `${5 - sessionsToday} more session${5 - sessionsToday !== 1 ? "s" : ""} to hit today's goal.`
            : "You've hit your daily goal. Great work! 🎉"}
        </p>
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-2">
        {quickActions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className="action-item bg-white border border-slate-200/50 shadow-sm hover:shadow-md"
          >
            <span className="action-icon">
              <action.icon className="size-5" />
            </span>
            <span className="flex-1 leading-tight min-w-0">
              <span className="block text-sm font-semibold text-slate-900">{action.label}</span>
              <span className="block text-xs text-slate-600 truncate">{action.desc}</span>
            </span>
            <ArrowRight className="size-4 text-slate-400 shrink-0" />
          </Link>
        ))}
      </div>

    </aside>
  );
};

export default HomeAside;
