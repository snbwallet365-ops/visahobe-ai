import { Suspense } from "react";
import ChatWorkspace from "@/components/ChatWorkspace";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <ChatWorkspace mode="search" />
    </Suspense>
  );
}
