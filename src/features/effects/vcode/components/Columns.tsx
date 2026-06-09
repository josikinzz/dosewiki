import { PropsWithChildren } from "react";

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
    <div className="theme-card-surface rounded-xl border p-4">
      {children}
    </div>
  );
}
