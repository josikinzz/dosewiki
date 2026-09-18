import { addCollection, type IconifyJSON } from "@iconify/react";
import iconData from "./iconData.editor.generated.json";

/** Only the independently built editor registers these extra synchronous glyphs. */
export default function registerEditorIcons(): void {
  for (const collection of iconData.collections as unknown as IconifyJSON[]) {
    addCollection(collection);
  }
}
