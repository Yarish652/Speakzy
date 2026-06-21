import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStreamToken } from "../lib/api";
import useChatStore from "../store/useChatStore";
import useAuthUser from "./useAuthUser";

const useInitStreamChat = () => {
  const { authUser } = useAuthUser();
  const initClient = useChatStore((s) => s.initClient);

  const { data: tokenData } = useQuery({
    queryKey: ["streamToken"],
    queryFn: getStreamToken,
    enabled: !!authUser,
  });

  useEffect(() => {
    if (tokenData?.token && authUser) {
      initClient(authUser, tokenData.token);
    }
  }, [tokenData, authUser, initClient]);
};

export default useInitStreamChat;
