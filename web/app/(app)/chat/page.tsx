import { Suspense } from "react";

import { ChatView } from "@/components/chat/ChatView";

// useSearchParams (the `c` and `intent` params) needs a Suspense boundary to build.
export default function ChatPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
