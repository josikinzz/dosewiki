import { PropsWithChildren } from "react";

export function Paragraph({ children }: PropsWithChildren) {
  return (
    <p className="type-supporting-copy theme-text-secondary">
      {children}
    </p>
  );
}
