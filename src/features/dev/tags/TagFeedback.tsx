import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Notice } from "@/features/dev/components";

import type { TagNoticeState, TagUndo } from "./types";

export function TagFeedback({
  notice,
  undo = null,
  onUndo,
  busy = false,
  onDismiss,
}: {
  notice: TagNoticeState;
  undo?: TagUndo | null;
  onUndo?: () => void;
  busy?: boolean;
  onDismiss?: () => void;
}) {
  const canUndo = notice.type === "success" && undo !== null && onUndo !== undefined;
  return (
    <Notice
      placement="inline"
      tone={notice.type === "error" ? "danger" : "success"}
      dismiss={onDismiss}
      actions={canUndo ? (
        <Button type="button" variant="outline" size="xs" onClick={onUndo} disabled={busy}>
          <Icon icon="lucide:undo-2" size={14} />
          Undo {undo.action.toLowerCase()}
        </Button>
      ) : undefined}
    >
      {notice.message}
    </Notice>
  );
}
