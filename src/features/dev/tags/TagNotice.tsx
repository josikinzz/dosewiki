import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { ActionNotice } from "@/features/dev/components";

import type { Notice, TagUndo } from "./types";

export type TagNoticeProps = {
  notice: Notice;
  /** The rewrite this notice reports, while it can still be put back. */
  undo?: TagUndo | null;
  onUndo?: () => void;
  busy?: boolean;
  onDismiss?: () => void;
};

/**
 * The tool's feedback pill. A success that can still be reversed carries its
 * own Undo, so the record of what changed and the way back sit together.
 */
export function TagNotice({ notice, undo = null, onUndo, busy = false, onDismiss }: TagNoticeProps) {
  const canUndo = notice.type === "success" && undo !== null && onUndo !== undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionNotice tone={notice.type === "error" ? "danger" : "success"} onDismiss={onDismiss}>
        {notice.message}
      </ActionNotice>
      {canUndo ? (
        <Button type="button" variant="glass" size="xs" className="rounded-full" onClick={onUndo} disabled={busy}>
          <Icon icon="lucide:undo-2" size={14} />
          Undo {undo.action.toLowerCase()}
        </Button>
      ) : null}
    </div>
  );
}
