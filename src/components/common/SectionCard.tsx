import { type CSSProperties, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  delay?: number;
  className?: string;
  id?: string;
}

export function SectionCard({ children, delay = 0, className = "", id }: PropsWithChildren<SectionCardProps>) {
  const style =
    delay > 0
      ? ({ "--theme-section-card-delay": `${delay}s` } as CSSProperties)
      : undefined;

  return (
    <section
      id={id}
      style={style}
      className={cn(
        "theme-public-card theme-public-card-interactive theme-section-card-enter rounded-2xl border p-6 ring-1 ring-white/5 backdrop-blur-sm backdrop-safe",
        className,
      )}
    >
      {children}
    </section>
  );
}
