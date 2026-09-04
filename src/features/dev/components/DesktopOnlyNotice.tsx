import type { ReactNode } from "react";
import { EditorNotice } from "./EditorNotice";

/** Shown wherever a tool step has no touch grammar and stays read-only on a coarse pointer. */
export const DESKTOP_ONLY_NOTICE = "This step needs a desktop browser. Everything else here works on a phone.";

export interface DesktopOnlyNoticeProps {
  title?: ReactNode;
  className?: string;
}

export function DesktopOnlyNotice({ title, className }: DesktopOnlyNoticeProps) {
  return (
    <EditorNotice
      className={className}
      notice={{
        tone: "info",
        icon: "lucide:monitor",
        title,
        message: DESKTOP_ONLY_NOTICE,
      }}
    />
  );
}
