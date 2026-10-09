import { Link } from "react-router";
import { LANGUAGE_TO_FLAG } from "../constants";
import useChatStore from "../store/useChatStore";

// `menu` is an optional slot rendered at the top-right of the card header
// (FriendsPage passes the "more options" dropdown there).
const FriendCard = ({ friend, menu }) => {
  const unreadCount = useChatStore((s) => s.unreadByUser[friend._id] || 0);

  return (
    <div className="flex h-full flex-col rounded-3xl border border-base-200/80 bg-base-100 p-4 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.16)] transition-shadow duration-200 hover:shadow-[0_14px_32px_-20px_rgba(15,23,42,0.24)]">
      <div className="mb-4 flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="avatar size-11">
            {friend.profilePic ? (
              <img src={friend.profilePic} alt={friend.fullName} className="rounded-full w-full h-full object-cover" />
            ) : (
              <div className="bg-base-300 w-full h-full rounded-full flex items-center justify-center">
                <span className="text-sm font-bold">{friend.fullName?.charAt(0)}</span>
              </div>
            )}
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 badge badge-primary badge-xs px-1">
              {unreadCount}
            </span>
          )}
        </div>
        <h3 className="min-w-0 flex-1 truncate font-semibold">{friend.fullName}</h3>
        {menu}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <span className="badge badge-secondary badge-sm capitalize">
          {getLanguageFlag(friend.nativeLanguage)} {friend.nativeLanguage}
        </span>
        <span className="badge badge-outline badge-sm capitalize">
          {getLanguageFlag(friend.learningLanguage)} {friend.learningLanguage}
        </span>
      </div>

      <Link to={`/chat/${friend._id}`} className="btn btn-outline btn-sm mt-auto w-full rounded-xl">
        Message
      </Link>
    </div>
  );
};
export default FriendCard;

export function getLanguageFlag(language) {
  if (!language) return null;

  const langLower = language.toLowerCase();
  const countryCode = LANGUAGE_TO_FLAG[langLower];

  if (countryCode) {
    return (
      <img
        src={`https://flagcdn.com/24x18/${countryCode}.png`}
        alt={`${langLower} flag`}
        className="h-3 mr-1 inline-block"
      />
    );
  }
  return null;
}
