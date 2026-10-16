import { Suspense } from "react";
import ChatWorkspace from "@/components/ChatWorkspace";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <ChatWorkspace mode="chat" />
    </Suspense>
  );
}
