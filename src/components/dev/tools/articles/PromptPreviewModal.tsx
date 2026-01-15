import { createPortal } from "react-dom";
import { Icon } from "../../../common/Icon";

import { Button } from "@/components/ui/button";

interface PromptPreviewModalProps {
  systemPrompt: string;
  userMessage: string;
  onClose: () => void;
}

export function PromptPreviewModal({ systemPrompt, userMessage, onClose }: PromptPreviewModalProps) {
  const totalChars = systemPrompt.length + userMessage.length;
  
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
            <span className="font-medium text-white">Full Prompt Preview</span>
          </div>
          <Button
            variant="iconClose"
            onClick={onClose}
            title="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        {/* Window Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* System Prompt Section */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">System Prompt</span>
              <span className="text-xs text-white/40">({systemPrompt.length.toLocaleString()} chars)</span>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-fuchsia-500/20 bg-fuchsia-950/20 p-4 font-mono text-sm leading-relaxed text-white/80">
              {systemPrompt}
            </pre>
          </div>
          
          {/* User Message Section */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">User Message</span>
              <span className="text-xs text-white/40">({userMessage.length.toLocaleString()} chars)</span>
            </div>
            <pre className="whitespace-pre-wrap rounded-lg border border-violet-500/20 bg-violet-950/20 p-4 font-mono text-sm leading-relaxed text-white/80">
              {userMessage}
            </pre>
          </div>
        </div>
        {/* Window Status Bar */}
        <div className="shrink-0 border-t border-fuchsia-500/20 bg-fuchsia-950/30 px-4 py-2 text-xs text-white/40">
          Total: {totalChars.toLocaleString()} characters
        </div>
      </div>
    </div>,
    document.body
  );
}
