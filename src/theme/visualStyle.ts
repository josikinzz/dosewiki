import tokenInterface from "./theme-token-interface.json";
import type { VisualStyle } from "./index";

const { supportedVisualStyles } = tokenInterface;
const visualStyles = Object.freeze(supportedVisualStyles);

export function isVisualStyle(value: string | null | undefined): value is VisualStyle {
  return visualStyles.includes(value as VisualStyle);
}
