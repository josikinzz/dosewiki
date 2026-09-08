import type { ReactNode } from "react";

export type ArticleContextBridgeProps = { children: ReactNode; [key: string]: unknown };

export default function ArticleContextBridge({ children }: ArticleContextBridgeProps) {
  return <>{children}</>;
}
