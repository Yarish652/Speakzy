import { useQuery } from "@tanstack/react-query";
import { getAuthUser } from "../lib/api";

const useAuthUser = () => {
  const authUser = useQuery({
    queryKey: ["authUser"],
    queryFn: getAuthUser,
    retry: false, // auth check
  });

  return {
    isLoading: authUser.isLoading,
    authUser: authUser.data?.user,
    // Server-computed (ADMIN_EMAILS). Controls admin UI visibility only —
    // the /api/admin endpoints enforce access regardless of this flag.
    isAdmin: Boolean(authUser.data?.isAdmin),
  };
};
export default useAuthUser;
