import { Link } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { BellIcon, LogOutIcon, Languages, MenuIcon } from "lucide-react";
import ThemeSelector from "./ThemeSelector";
import useLogout from "../hooks/useLogout";

const Navbar = ({ showSidebar = false, onMenuClick }) => {
  const { authUser, isAdmin } = useAuthUser();

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

  const brandClass = `${showSidebar ? "hidden" : "hidden sm:flex"} items-center gap-2 whitespace-nowrap`;

  // const queryClient = useQueryClient();
  // const { mutate: logoutMutation } = useMutation({
  //   mutationFn: logout,
  //   onSuccess: () => queryClient.invalidateQueries({ queryKey: ["authUser"] }),
  // });

  const { logoutMutation } = useLogout();

  return (
    <nav className="bg-base-100 border-b border-base-200/70 sticky top-0 z-30 h-16 shadow-sm">
      <div className="mx-auto flex h-full max-w-8xl items-center px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          {showSidebar && (
            <button
              className="lg:hidden btn btn-ghost btn-square p-2 text-base-content/70 transition-colors duration-200 hover:bg-base-100 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
              onClick={onMenuClick}
              aria-label="Toggle sidebar"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          )}
          <Link to="/" className={brandClass}>
            <Languages className="size-6 text-primary" />
            <span className="text-lg font-semibold tracking-wide text-base-content">Speakzy</span>
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <Link to="/notifications" className="inline-flex">
            <button className="btn btn-ghost btn-square p-2 text-base-content/70 transition-colors duration-200 hover:bg-base-100 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100" aria-label="Notifications">
              <BellIcon className="h-5 w-5" />
            </button>
          </Link>

          <ThemeSelector />

          {isAdmin ? (
            <Link to="/admin" className="tooltip tooltip-bottom" data-tip="Admin dashboard" aria-label="Admin dashboard">
              {avatar}
            </Link>
          ) : (
            avatar
          )}

          <button
            className="btn btn-ghost btn-square p-2 text-base-content/70 transition-colors duration-200 hover:bg-base-100 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
            onClick={logoutMutation}
            aria-label="Log out"
          >
            <LogOutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </nav>
  );
};
export default Navbar;
