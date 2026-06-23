import { PropsWithChildren } from "react";

import { Surface } from "@/components/ui/surface";

/**
 * Multi-column layout container.
 */
export function Columns({ children }: PropsWithChildren) {
  return (
    <div className="grid gap-4 md:grid-cols-2 my-4">
      {children}
    </div>
  );
}

/**
 * Individual column within Columns container.
 */
export function Column({ children }: PropsWithChildren) {
  return (
    <Surface variant="none" padding="sm" radius="lg" className="theme-card-surface">
      {children}
    </Surface>
  );
}
