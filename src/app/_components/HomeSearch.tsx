"use client";

import { useRouter } from "next/navigation";
import { GlobalSearch } from "@/components/common/GlobalSearch";
import { viewToPath } from "@/utils/routing";
import type { AppView } from "@/types/navigation";

export function HomeSearch() {
  const router = useRouter();

  return (
    <GlobalSearch
      currentView={{ type: "home" }}
      onNavigate={(nextView: AppView) => router.push(viewToPath(nextView))}
      containerClassName="w-full"
      placeholder="Search dose.wiki"
      variant="home"
    />
  );
}
