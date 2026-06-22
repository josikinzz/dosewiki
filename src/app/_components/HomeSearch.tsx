"use client";

import { useRouter } from "next/navigation";
import { GlobalSearch } from "@/components/common/GlobalSearch";
import { viewToPath } from "@/utils/routing";
import type { AppView } from "@/types/navigation";

const HOME_VIEW = { type: "home" } satisfies AppView;

interface HomeSearchProps {
  compactSearchMode?: boolean;
  onSearchModeChange?: (isSearchMode: boolean) => void;
}

export function HomeSearch({
  compactSearchMode = false,
  onSearchModeChange,
}: HomeSearchProps) {
  const router = useRouter();

  return (
    <GlobalSearch
      currentView={HOME_VIEW}
      onNavigate={(nextView: AppView) => router.push(viewToPath(nextView))}
      containerClassName="w-full"
      compact={compactSearchMode}
      liveResultsMode
      onSearchModeChange={onSearchModeChange}
      placeholder="Search dose.wiki..."
      variant="home"
    />
  );
}
