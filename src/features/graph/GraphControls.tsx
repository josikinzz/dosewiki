import { memo, useState, useCallback } from "react";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";

interface GraphControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onSearch: (query: string) => void;
  searchResults: string[];
  onSelectSearchResult: (slug: string) => void;
}

export const GraphControls = memo(function GraphControls({
  onZoomIn,
  onZoomOut,
  onReset,
  onSearch,
  searchResults,
  onSelectSearchResult,
}: GraphControlsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const query = e.target.value;
      setSearchQuery(query);
      setShowResults(query.length > 0);
      onSearch(query);
    },
    [onSearch]
  );

  const handleSelectResult = useCallback(
    (slug: string) => {
      onSelectSearchResult(slug);
      setShowResults(false);
    },
    [onSelectSearchResult]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setShowResults(false);
    onSearch("");
  }, [onSearch]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <div className="relative">
          <Icon
            icon="lucide:search"
            size={16}
            className="theme-text-faint absolute left-3 top-1/2 -translate-y-1/2"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => searchQuery.length > 0 && setShowResults(true)}
            placeholder="Search substances..."
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-8 text-sm text-white placeholder-white/40 outline-none transition focus:border-fuchsia-400/50 focus:bg-white/10 focus:ring-1 focus:ring-fuchsia-400/30"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-white"
            >
              <Icon icon="lucide:x" size={14} />
            </button>
          )}
        </div>

        {showResults && searchResults.length > 0 && (
          <div className="theme-overlay-surface absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-xl border py-1 shadow-xl backdrop-blur">
            {searchResults.slice(0, 10).map((slug) => (
              <button
                key={slug}
                onClick={() => handleSelectResult(slug)}
                className="theme-text-secondary w-full px-3 py-1.5 text-left text-sm transition hover:bg-fuchsia-500/20 hover:text-white"
              >
                {slug}
              </button>
            ))}
            {searchResults.length > 10 && (
              <div className="theme-text-faint px-3 py-1.5 text-xs">
                +{searchResults.length - 10} more results
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onZoomIn}
          className="h-8 w-8 p-0"
          title="Zoom in"
        >
          <Icon icon="lucide:zoom-in" size={16} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onZoomOut}
          className="h-8 w-8 p-0"
          title="Zoom out"
        >
          <Icon icon="lucide:zoom-out" size={16} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onReset}
          className="gap-1.5 px-3"
          title="Reset view"
        >
          <Icon icon="lucide:rotate-ccw" size={14} />
          <span className="hidden sm:inline">Reset</span>
        </Button>
      </div>
    </div>
  );
});
