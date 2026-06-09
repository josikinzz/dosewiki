import { PropsWithChildren } from "react";

export function Bold({ children }: PropsWithChildren) {
  return <strong className="font-semibold text-[color:var(--theme-accent-strong)]">{children}</strong>;
}

export function Italic({ children }: PropsWithChildren) {
  return <em className="italic">{children}</em>;
}

export function Underline({ children }: PropsWithChildren) {
  return <span className="underline decoration-[color:color-mix(in_srgb,var(--theme-accent-strong)_50%,transparent)] underline-offset-[0.18em]">{children}</span>;
}

export function Strikethrough({ children }: PropsWithChildren) {
  return <span className="theme-text-muted line-through">{children}</span>;
}
