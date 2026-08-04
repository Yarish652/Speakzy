import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { UsersIcon, UserPlusIcon, CheckCircleIcon, MapPinIcon, UserMinusIcon } from "lucide-react";
import toast from "react-hot-toast";

import { getUserFriends, getRecommendedUsers, getOutgoingFriendReqs, sendFriendRequest, removeFriend } from "../lib/api";
import FriendCard from "../components/FriendCard";
import NoFriendsFound from "../components/NoFriendsFound";
import { getLanguageFlag } from "../components/FriendCard";
import { capitialize } from "../lib/utils";

const FriendsPage = () => {
  const queryClient = useQueryClient();
  const [outgoingRequestsIds, setOutgoingRequestsIds] = useState(new Set());
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null);

  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ["friends"],
    queryFn: getUserFriends,
  });

  const { data: recommendedUsers = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn: getRecommendedUsers,
  });

  const { data: outgoingFriendReqs } = useQuery({
    queryKey: ["outgoingFriendReqs"],
    queryFn: getOutgoingFriendReqs,
  });

  const { mutate: sendRequestMutation, isPending } = useMutation({
    mutationFn: sendFriendRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["outgoingFriendReqs"] }),
  });

  const { mutate: removeFriendMutation, isPending: isRemoving } = useMutation({
    mutationFn: removeFriend,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["friends"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setConfirmingRemoveId(null);
      toast.success("Friend removed");
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Failed to remove friend");
      setConfirmingRemoveId(null);
    },
  });

  useEffect(() => {
    const outgoingIds = new Set();
    if (outgoingFriendReqs?.length > 0) {
      outgoingFriendReqs.forEach((req) => {
        if (req?.recipient?._id) outgoingIds.add(req.recipient._id);
      });
      setOutgoingRequestsIds(outgoingIds);
    }
  }, [outgoingFriendReqs]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 h-full">
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* LEFT — Your Friends */}
        <div className="w-full lg:flex-1 lg:min-w-0 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight text-base-content">Your Friends</h2>
              <Link to="/notifications" className="btn btn-outline btn-sm">
                <UsersIcon className="size-4 mr-2" />
                Friend Requests
              </Link>
            </div>

          {loadingFriends ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg" />
            </div>
          ) : friends.length === 0 ? (
            <NoFriendsFound />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {friends.map((friend) => (
                <div key={friend._id}>
                  <FriendCard friend={friend} />

                  {confirmingRemoveId === friend._id ? (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        className="btn btn-error btn-sm flex-1"
                        onClick={() => removeFriendMutation(friend._id)}
                        disabled={isRemoving}
                      >
                        Confirm remove
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmingRemoveId(null)}
                        disabled={isRemoving}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-outline btn-sm w-full mt-2"
                      onClick={() => setConfirmingRemoveId(friend._id)}
                    >
                      <UserMinusIcon className="size-3 mr-1" />
                      Remove friend
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — Find Language Partners */}
        <div className="w-full lg:w-80 lg:shrink-0 space-y-4">
          <h2 className="text-xl font-semibold tracking-tight text-base-content">Find Partners</h2>

          {loadingUsers ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : recommendedUsers.length === 0 ? (
            <div className="card bg-base-200 p-4 text-center">
              <p className="text-sm text-base-content/60">No new people to discover right now.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recommendedUsers.map((user) => {
                const hasRequestBeenSent = outgoingRequestsIds.has(user._id);
                return (
                  <div key={user._id} className="rounded-[12px] border border-base-200/80 bg-base-100 p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="avatar w-10 h-10 rounded-full shrink-0 overflow-hidden">
                        {user.profilePic ? (
                          <img src={user.profilePic} alt={user.fullName} className="rounded-full w-full h-full object-cover" />
                        ) : (
                          <div className="bg-base-300 w-full h-full rounded-full flex items-center justify-center">
                            <span className="text-sm font-bold">{user.fullName?.charAt(0)}</span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{user.fullName}</p>
                        {user.location && (
                          <div className="flex items-center gap-1 text-xs text-base-content/50">
                            <MapPinIcon className="size-3 shrink-0" />
                            <span className="truncate">{user.location}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="badge badge-secondary badge-sm">
                        {getLanguageFlag(user.nativeLanguage)} {capitialize(user.nativeLanguage)}
                      </span>
                      <span className="badge badge-outline badge-sm">
                        {getLanguageFlag(user.learningLanguage)} {capitialize(user.learningLanguage)}
                      </span>
                    </div>

                    <button
                      className={`btn btn-sm w-full ${hasRequestBeenSent ? "btn-disabled" : "btn-primary"}`}
                      onClick={() => sendRequestMutation(user._id)}
                      disabled={hasRequestBeenSent || isPending}
                    >
                      {hasRequestBeenSent ? (
                        <>
                          <CheckCircleIcon className="size-3 mr-1" />
                          Request Sent
                        </>
                      ) : (
                        <>
                          <UserPlusIcon className="size-3 mr-1" />
                          Send Request
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default FriendsPage;