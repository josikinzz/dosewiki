import { PropsWithChildren } from "react";

export function Paragraph({ children }: PropsWithChildren) {
  return (
    <p className="text-sm text-white/80 leading-relaxed">
      {children}
    </p>
  );
}
