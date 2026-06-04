import { type CSSProperties, PropsWithChildren } from "react";
import { InteractiveContentCard } from "@/components/ui/surface";
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
    <InteractiveContentCard
      asChild
      padding="lg"
      radius="xl"
      className={cn("theme-section-card-enter", className)}
    >
      <section id={id} style={style}>
        {children}
      </section>
    </InteractiveContentCard>
  );
}
