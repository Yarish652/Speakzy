import { useEffect } from "react";
import { useLocation } from "react-router";
import toast from "react-hot-toast";
import useChatStore from "../store/useChatStore";
import useAuthUser from "./useAuthUser";

const useMessageNotifications = () => {
  const client = useChatStore((s) => s.client);
  const { authUser } = useAuthUser();
  const location = useLocation();

  useEffect(() => {
    if (!client || !authUser) return;

    const handler = (event) => {
      // Don't notify if the sender is ourselves
      if (!event.message || event.user?.id === authUser._id) return;

      // Don't notify if we're already viewing that chat
      const channelId = event.channel?.id || "";
      const parts = channelId.split("-");
      const otherId = parts.find((p) => p !== authUser._id);
      if (otherId && location.pathname === `/chat/${otherId}`) return;

      const senderName = event.user?.name || "Someone";
      const avatar = event.user?.image;
      const rawText = event.message.text || "";
      const preview = rawText.length > 60 ? rawText.slice(0, 60) + "…" : rawText || "Sent you a message";

      toast.custom(
        (t) => (
          <div
            className={`flex items-center gap-3 p-3 bg-base-200 border border-base-300 rounded-xl shadow-xl max-w-sm w-full transition-all duration-300 ${
              t.visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
            }`}
          >
            {avatar ? (
              <img src={avatar} alt={senderName} className="size-10 rounded-full shrink-0 object-cover" />
            ) : (
              <div className="size-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-primary-content font-bold text-sm">
                  {senderName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{senderName}</p>
              <p className="text-xs text-base-content/60 truncate mt-0.5">{preview}</p>
            </div>
          </div>
        ),
        { duration: 4000, position: "top-right" }
      );
    };

    client.on("notification.message_new", handler);

    return () => {
      client.off("notification.message_new", handler);
    };
  }, [client, authUser, location.pathname]);
};

export default useMessageNotifications;
