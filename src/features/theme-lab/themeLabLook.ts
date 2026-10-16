import type { VisualStyle } from "@/theme";
import { isVisualStyle } from "@/theme/visualStyle";

export type LabLook = { visualStyle: VisualStyle };

export const DEFAULT_LOOK: LabLook = { visualStyle: "fun" };

export function lookKey(look: LabLook): string {
  return look.visualStyle;
}

export function parseLookKey(value: unknown): LabLook | null {
  if (typeof value !== "string") return null;
  const [visualStyle, accent, surface, ...rest] = value.split("|");
  if (rest.length > 0 || !isVisualStyle(visualStyle)) return null;
  if (accent === undefined && surface === undefined) return { visualStyle };
  return accent === "default" && surface === "orchid" ? { visualStyle } : null;
}
