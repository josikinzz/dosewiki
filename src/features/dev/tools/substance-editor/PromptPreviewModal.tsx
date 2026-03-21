import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PromptPreviewModalProps {
  systemPrompt: string;
  userMessage: string;
  onClose: () => void;
}

export function PromptPreviewModal({ systemPrompt, userMessage, onClose }: PromptPreviewModalProps) {
  const totalChars = systemPrompt.length + userMessage.length;
 
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showClose={false}
        className="theme-editor-window z-[9999] flex h-[min(85vh,900px)] w-[min(100%,80rem)] max-w-5xl flex-col overflow-hidden rounded-2xl border p-0"
      >
        <DialogHeader className="theme-editor-titlebar flex shrink-0 flex-row items-center justify-between border-b px-4 py-3 text-left">
          <div className="flex items-center gap-3">
            <div className="flex gap-2">
              <div className="theme-editor-window-chrome h-3 w-3 rounded-full" />
              <div className="theme-editor-window-chrome h-3 w-3 rounded-full opacity-80" />
              <div className="theme-editor-window-chrome h-3 w-3 rounded-full opacity-65" />
            </div>
            <div>
              <DialogTitle className="font-medium text-white">Full Prompt Preview</DialogTitle>
              <DialogDescription className="sr-only">
                Review the full system prompt and user message before generating content.
              </DialogDescription>
            </div>
          </div>
          <Button
            variant="iconClose"
            onClick={onClose}
            title="Close"
          >
            <Icon icon="lucide:x" className="h-5 w-5" size={20} />
          </Button>
        </DialogHeader>
        <div className="flex-1 space-y-6 overflow-auto p-6">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">System Prompt</span>
              <span className="text-xs text-white/40">({systemPrompt.length.toLocaleString()} chars)</span>
            </div>
            <pre className="theme-editor-pane whitespace-pre-wrap rounded-lg border p-4 font-mono text-sm leading-relaxed text-white/80">
              {systemPrompt}
            </pre>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">User Message</span>
              <span className="text-xs text-white/40">({userMessage.length.toLocaleString()} chars)</span>
            </div>
            <pre className="theme-editor-pane whitespace-pre-wrap rounded-lg border p-4 font-mono text-sm leading-relaxed text-white/80">
              {userMessage}
            </pre>
          </div>
        </div>
        <div className="theme-editor-statusbar shrink-0 border-t px-4 py-2 text-xs">
          Total: {totalChars.toLocaleString()} characters
        </div>
      </DialogContent>
    </Dialog>
  );
}
