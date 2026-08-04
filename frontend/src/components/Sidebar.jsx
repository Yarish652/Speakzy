import { Link, useLocation } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { BellIcon, HomeIcon, Languages, UsersIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getFriendRequests } from "../lib/api";
import useChatStore from "../store/useChatStore";

const Sidebar = ({ onClose }) => {
  const { authUser, isAdmin } = useAuthUser();
  const location = useLocation();
  const currentPath = location.pathname;

  const totalUnread = useChatStore((s) => s.totalUnread);

  const { data: friendRequests } = useQuery({
    queryKey: ["friendRequests"],
    queryFn: getFriendRequests,
    refetchInterval: 30000,
  });
  const pendingRequests = friendRequests?.incomingReqs?.length || 0;

  return (
    <aside className="w-64 bg-base-100 border-r border-base-200 flex flex-col h-full">
      <div className="p-4 border-b border-base-200 h-16 flex items-center">
        <Link to="/" className="flex items-center gap-2 whitespace-nowrap">
          <Languages className="size-6 text-primary" />
          <span className="text-lg font-semibold tracking-wide text-base-content">Speakzy</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-2.5">
        <Link
          to="/"
          onClick={onClose}
          className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-colors duration-200 ${currentPath === "/" ? "bg-primary/5 text-base-content font-semibold" : "text-base-content/80 hover:bg-base-100 hover:text-base-content"}`}
        >
          <HomeIcon className="size-5" />
          <span>Home</span>
        </Link>

        <Link
          to="/friends"
          onClick={onClose}
          className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-colors duration-200 ${currentPath === "/friends" ? "bg-primary/5 text-base-content font-semibold" : "text-base-content/80 hover:bg-base-100 hover:text-base-content"}`}
        >
          <UsersIcon className="size-5" />
          <span>Friends</span>
          {totalUnread > 0 && <span className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white text-[11px] font-semibold">{totalUnread}</span>}
        </Link>

        <Link
          to="/notifications"
          onClick={onClose}
          className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-colors duration-200 ${currentPath === "/notifications" ? "bg-primary/5 text-base-content font-semibold" : "text-base-content/80 hover:bg-base-100 hover:text-base-content"}`}
        >
          <BellIcon className="size-5" />
          <span>Notifications</span>
          {pendingRequests > 0 && <span className="ml-auto inline-flex items-center justify-center w-6 h-6 rounded-full bg-error text-white text-[11px] font-semibold">{pendingRequests}</span>}
        </Link>
      </nav>

      <div className="p-4 border-t border-base-200 mt-auto">
        <div className="flex items-center gap-3">
          {(() => {
            const avatar = (
              <div className="avatar">
                <div className={`w-10 rounded-full ${isAdmin ? "ring ring-primary ring-offset-base-100 ring-offset-2" : ""}`}>
                  {authUser?.profilePic ? (
                    <img src={authUser.profilePic} alt={authUser.fullName} />
                  ) : (
                    <div className="bg-base-300 w-full h-full rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold">{authUser?.fullName?.charAt(0)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
            return isAdmin ? (
              <Link
                to="/admin"
                onClick={onClose}
                className="tooltip tooltip-right"
                data-tip="Admin dashboard"
                aria-label="Admin dashboard"
              >
                {avatar}
              </Link>
            ) : (
              avatar
            );
          })()}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{authUser?.fullName}</p>
            <p className="text-xs text-success flex items-center gap-1 leading-5">
              <span className="inline-block h-2 w-2 rounded-full bg-success" />
              Online
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
export default Sidebar;
