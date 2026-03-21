import { PropsWithChildren } from "react";

export function Paragraph({ children }: PropsWithChildren) {
  return (
    <p className="type-supporting-copy text-white/80">
      {children}
    </p>
  );
}
