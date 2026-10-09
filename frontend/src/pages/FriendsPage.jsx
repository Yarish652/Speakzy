import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import { UsersIcon, UserPlusIcon, CheckCircleIcon, MapPinIcon, UserMinusIcon, EllipsisVerticalIcon } from "lucide-react";
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

  const friendToRemove = friends.find((f) => f._id === confirmingRemoveId);

  return (
    <div className="mx-auto min-h-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col lg:flex-row gap-8 items-start lg:gap-10">

        {/* LEFT — Your Friends */}
        <div className="w-full lg:flex-1 lg:min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-base-content">Your Friends</h2>
              <Link to="/notifications" className="btn btn-outline btn-sm rounded-xl">
                <UsersIcon className="size-4" />
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
                <FriendCard
                  key={friend._id}
                  friend={friend}
                  menu={
                    // Opens on hover (desktop) and on tap/focus (touch, keyboard).
                    // pt-1 instead of a margin keeps the hover area unbroken
                    // between the trigger and the menu.
                    <div className="dropdown dropdown-end dropdown-hover shrink-0">
                      <div
                        tabIndex={0}
                        role="button"
                        aria-label={`More options for ${friend.fullName}`}
                        className="btn btn-ghost btn-sm btn-circle text-base-content/60 hover:text-base-content"
                      >
                        <EllipsisVerticalIcon className="size-4" />
                      </div>
                      <div tabIndex={0} className="dropdown-content z-20 pt-1">
                        <ul className="menu w-44 rounded-2xl border border-base-200 bg-base-100 p-1.5 shadow-lg">
                          <li>
                            <button
                              className="text-error"
                              onClick={() => {
                                document.activeElement?.blur();
                                setConfirmingRemoveId(friend._id);
                              }}
                            >
                              <UserMinusIcon className="size-4" />
                              Remove friend
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* RIGHT — Find Language Partners */}
        <div className="w-full lg:w-80 lg:shrink-0 space-y-5">
          <h2 className="text-2xl font-semibold tracking-tight text-base-content">Find Partners</h2>

          {loadingUsers ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : recommendedUsers.length === 0 ? (
            <div className="rounded-3xl border border-base-200/80 bg-base-100 p-6 text-center shadow-[0_8px_24px_-18px_rgba(15,23,42,0.16)]">
              <p className="text-sm text-base-content/60">No new people to discover right now.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recommendedUsers.map((user) => {
                const hasRequestBeenSent = outgoingRequestsIds.has(user._id);
                return (
                  <div key={user._id} className="rounded-3xl border border-base-200/80 bg-base-100 p-4 space-y-3 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.16)]">
                    <div className="flex items-center gap-3">
                      <div className="avatar size-11 rounded-full shrink-0 overflow-hidden">
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

                    <div className="flex flex-wrap gap-1.5">
                      <span className="badge badge-secondary badge-sm">
                        {getLanguageFlag(user.nativeLanguage)} {capitialize(user.nativeLanguage)}
                      </span>
                      <span className="badge badge-outline badge-sm">
                        {getLanguageFlag(user.learningLanguage)} {capitialize(user.learningLanguage)}
                      </span>
                    </div>

                    <button
                      className={`btn btn-sm w-full rounded-xl ${hasRequestBeenSent ? "btn-disabled" : "btn-primary"}`}
                      onClick={() => sendRequestMutation(user._id)}
                      disabled={hasRequestBeenSent || isPending}
                    >
                      {hasRequestBeenSent ? (
                        <>
                          <CheckCircleIcon className="size-4" />
                          Request Sent
                        </>
                      ) : (
                        <>
                          <UserPlusIcon className="size-4" />
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

      {/* Remove-friend confirmation (same flow as before: confirmingRemoveId) */}
      {friendToRemove && (
        <div className="modal modal-open" role="dialog" aria-labelledby="remove-friend-title">
          <div className="modal-box max-w-sm rounded-3xl">
            <h3 id="remove-friend-title" className="text-lg font-semibold">Remove friend?</h3>
            <p className="mt-2 text-sm text-base-content/70">
              {friendToRemove.fullName} will be removed from your friends. You can send them a new
              request later.
            </p>
            <div className="modal-action mt-6">
              <button
                className="btn btn-ghost btn-sm rounded-xl"
                onClick={() => setConfirmingRemoveId(null)}
                disabled={isRemoving}
              >
                Cancel
              </button>
              <button
                className="btn btn-error btn-sm rounded-xl"
                onClick={() => removeFriendMutation(friendToRemove._id)}
                disabled={isRemoving}
              >
                {isRemoving && <span className="loading loading-spinner loading-xs" />}
                Remove
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => !isRemoving && setConfirmingRemoveId(null)} />
        </div>
      )}
    </div>
  );
};

export default FriendsPage;