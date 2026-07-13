import { Link, useLocation } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { BellIcon, LogOutIcon, Languages, MenuIcon } from "lucide-react";
import ThemeSelector from "./ThemeSelector";
import useLogout from "../hooks/useLogout";

const Navbar = ({ showSidebar = false, onMenuClick }) => {
  const { authUser, isAdmin } = useAuthUser();
  const location = useLocation();
  const isChatPage = location.pathname?.startsWith("/chat");

  const avatar = (
    <div className="avatar">
      <div className={`w-9 rounded-full ${isAdmin ? "ring ring-primary ring-offset-base-200 ring-offset-1" : ""}`}>
        {authUser?.profilePic ? (
          <img src={authUser.profilePic} alt={authUser.fullName} />
        ) : (
          <div className="bg-base-300 w-full h-full rounded-full flex items-center justify-center">
            <span className="text-sm font-bold">{authUser?.fullName?.charAt(0)}</span>
          </div>
        )}
      </div>
    </div>
  );

  // const queryClient = useQueryClient();
  // const { mutate: logoutMutation } = useMutation({
  //   mutationFn: logout,
  //   onSuccess: () => queryClient.invalidateQueries({ queryKey: ["authUser"] }),
  // });

  const { logoutMutation } = useLogout();

  return (
    <nav className="bg-base-200 border-b border-base-300 sticky top-0 z-30 h-16 flex items-center">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-end w-full">
          {/* Hamburger — only on mobile when sidebar is available */}
          {showSidebar && (
            <button
              className="btn btn-ghost btn-circle lg:hidden mr-auto"
              onClick={onMenuClick}
              aria-label="Toggle sidebar"
            >
              <MenuIcon className="h-6 w-6" />
            </button>
          )}

          {/* LOGO - ONLY IN THE CHAT PAGE */}
          {isChatPage && (
            <div className="pl-5">
              <Link to="/" className="flex items-center gap-2.5">
                <Languages className="size-9 text-primary" />
                <span className="text-3xl font-bold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary  tracking-wider">
                  Speakzy
                </span>
              </Link>
            </div>
          )}

          <div className="flex items-center gap-3 sm:gap-4 ml-auto">
            <Link to={"/notifications"}>
              <button className="btn btn-ghost btn-circle">
                <BellIcon className="h-6 w-6 text-base-content opacity-70" />
              </button>
            </Link>
          </div>

          {/* TODO */}
          <ThemeSelector />

          {/* Admins get a linked avatar into the LLM dashboard; everyone
              else sees a plain avatar. The flag is server-computed, and the
              dashboard API 403s non-admins regardless of what's clicked. */}
          {isAdmin ? (
            <Link to="/admin" className="tooltip tooltip-bottom" data-tip="Admin dashboard" aria-label="Admin dashboard">
              {avatar}
            </Link>
          ) : (
            avatar
          )}

          {/* Logout button */}
          <button className="btn btn-ghost btn-circle" onClick={logoutMutation}>
            <LogOutIcon className="h-6 w-6 text-base-content opacity-70" />
          </button>
        </div>
      </div>
    </nav>
  );
};
export default Navbar;
