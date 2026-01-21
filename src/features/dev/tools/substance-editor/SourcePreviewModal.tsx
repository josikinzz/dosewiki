import { createPortal } from "react-dom";
import { Icon } from "@/components/common/Icon";

import { Button } from "@/components/ui/button";

import type { SourceInfo } from "@/hooks/useArticleSources";

interface SourcePreviewModalProps {
  source: SourceInfo;
  content: string | null;
  onClose: () => void;
}

export function SourcePreviewModal({ source, content, onClose }: SourcePreviewModalProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-fuchsia-500/30 bg-gradient-to-b from-[#1a1030] via-[#130e2b] to-[#0f0a1f] shadow-2xl shadow-fuchsia-500/10"
      >
        {/* Window Title Bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-fuchsia-500/20 bg-fuchsia-950/40 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Window controls (decorative) */}
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-fuchsia-500/60" />
              <div className="h-3 w-3 rounded-full bg-violet-500/60" />
              <div className="h-3 w-3 rounded-full bg-purple-500/60" />
            </div>
            <span className="font-medium text-white">{source.displayName}</span>
          </div>
          <Button
            variant="iconClose"
            onClick={onClose}
            title="Close"
          >
            <Icon icon="lucide:x" className="h-5 w-5" size={20} />
          </Button>
        </div>
        {/* Window Content */}
        <div className="flex-1 overflow-auto p-6">
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-white/80">
            {content ?? "Loading..."}
          </pre>
        </div>
        {/* Window Status Bar */}
        <div className="shrink-0 border-t border-fuchsia-500/20 bg-fuchsia-950/30 px-4 py-2 text-xs text-white/40">
          {content ? `${content.length.toLocaleString()} characters` : ""}
        </div>
      </div>
    </div>,
    document.body
  );
}
