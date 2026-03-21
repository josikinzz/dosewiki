import { PropsWithChildren } from "react";

export function Bold({ children }: PropsWithChildren) {
  return <strong className="font-semibold text-white/95">{children}</strong>;
}

export function Italic({ children }: PropsWithChildren) {
  return <em className="italic">{children}</em>;
}

export function Underline({ children }: PropsWithChildren) {
  return <span className="underline decoration-fuchsia-400/50 underline-offset-[0.18em]">{children}</span>;
}

export function Strikethrough({ children }: PropsWithChildren) {
  return <span className="line-through text-white/60">{children}</span>;
}
