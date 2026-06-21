import { create } from "zustand";
import { StreamChat } from "stream-chat";
import toast from "react-hot-toast";

const STREAM_API_KEY = import.meta.env.VITE_STREAM_API_KEY;

const useChatStore = create((set, get) => ({
  client: null,
  unreadByUser: {},
  totalUnread: 0,

  initClient: async (authUser, token) => {
    if (get().client?.userID) return;

    try {
      const client = StreamChat.getInstance(STREAM_API_KEY);

      if (!client.userID) {
        await client.connectUser(
          { id: authUser._id, name: authUser.fullName, image: authUser.profilePic },
          token
        );
      }

      // Set client immediately so hooks can use it right away
      set({ client });

      // Listen for new messages from friends
      client.on("notification.message_new", (event) => {
        if (!event.message || event.user?.id === authUser._id) return;

        const senderName = event.user?.name || "Someone";
        const rawText = event.message.text || "";
        const preview =
          rawText.length > 60 ? rawText.slice(0, 60) + "…" : rawText || "Sent you a message";

        // Show notification toast
        toast(`${senderName}: ${preview}`, {
          icon: "💬",
          duration: 4000,
          style: { maxWidth: "360px" },
        });

        // Update unread count
        const parts = (event.channel?.id || "").split("-");
        const otherId = parts.find((p) => p !== authUser._id);
        if (!otherId) return;

        set((state) => ({
          unreadByUser: {
            ...state.unreadByUser,
            [otherId]: (state.unreadByUser[otherId] || 0) + 1,
          },
          totalUnread: state.totalUnread + 1,
        }));
      });

      // Load initial unread counts from existing channels
      try {
        const channels = await client.queryChannels(
          { type: "messaging", members: { $in: [authUser._id] } },
          { last_message_at: -1 },
          { limit: 30, state: true, watch: false }
        );

        const unreadByUser = {};
        let totalUnread = 0;

        channels.forEach((ch) => {
          const count = ch.countUnread();
          if (count > 0) {
            const otherId = Object.keys(ch.state.members).find(
              (id) => id !== authUser._id
            );
            if (otherId) {
              unreadByUser[otherId] = count;
              totalUnread += count;
            }
          }
        });

        set({ unreadByUser, totalUnread });
      } catch (e) {
        console.error("Failed to load initial unread counts:", e);
      }
    } catch (e) {
      console.error("Failed to initialize Stream Chat:", e);
    }
  },

  clearUnread: (userId) => {
    set((state) => {
      const count = state.unreadByUser[userId] || 0;
      if (count === 0) return state;
      const { [userId]: _, ...rest } = state.unreadByUser;
      return { unreadByUser: rest, totalUnread: Math.max(0, state.totalUnread - count) };
    });
  },

  disconnectClient: async () => {
    const { client } = get();
    if (client?.userID) {
      await client.disconnectUser();
      set({ client: null, unreadByUser: {}, totalUnread: 0 });
    }
  },
}));

export default useChatStore;
