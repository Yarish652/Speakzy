import { Link } from "react-router";
import { LANGUAGE_TO_FLAG } from "../constants";
import useChatStore from "../store/useChatStore";

const FriendCard = ({ friend }) => {
  const unreadCount = useChatStore((s) => s.unreadByUser[friend._id] || 0);

  return (
    <div className="rounded-[16px] border border-base-200/80 bg-base-100 p-3 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3 mb-3">
        <div className="relative">
          <div className="avatar w-10 h-10">
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
        <h3 className="font-semibold truncate">{friend.fullName}</h3>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        <span className="badge badge-secondary badge-sm">
          {getLanguageFlag(friend.nativeLanguage)} {friend.nativeLanguage}
        </span>
        <span className="badge badge-outline badge-sm">
          {getLanguageFlag(friend.learningLanguage)} {friend.learningLanguage}
        </span>
      </div>

      <Link to={`/chat/${friend._id}`} className="btn btn-outline btn-sm w-full">
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
