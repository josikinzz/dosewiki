import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { SourceInfo } from "@/hooks/useArticleSources";

interface SourcePreviewModalProps {
  source: SourceInfo;
  content: string | null;
  onClose: () => void;
}

export function SourcePreviewModal({ source, content, onClose }: SourcePreviewModalProps) {
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
              <DialogTitle className="font-medium text-white">{source.displayName}</DialogTitle>
              <DialogDescription className="sr-only">
                Preview the extracted source content for this article source.
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
        <div className="flex-1 overflow-auto p-6">
          <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-white/80">
            {content ?? "Loading..."}
          </pre>
        </div>
        <div className="theme-editor-statusbar shrink-0 border-t px-4 py-2 text-xs">
          {content ? `${content.length.toLocaleString()} characters` : ""}
        </div>
      </DialogContent>
    </Dialog>
  );
}
