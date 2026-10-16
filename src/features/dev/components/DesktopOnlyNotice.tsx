import type { ReactNode } from "react";
import { Notice } from "./Notice";

export const DESKTOP_ONLY_NOTICE = "This step needs a desktop browser. Everything else here works on a phone.";

export interface DesktopOnlyNoticeProps {
  title?: ReactNode;
  className?: string;
}

export function DesktopOnlyNotice({ title, className }: DesktopOnlyNoticeProps) {
  return (
    <Notice
      className={className}
      tone="info" icon="lucide:monitor" title={title} message={DESKTOP_ONLY_NOTICE}
    />
  );
}
