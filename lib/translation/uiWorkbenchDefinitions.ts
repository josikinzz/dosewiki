import "server-only";

import inventory from "../../src/i18n/uiWorkbenchInventory.generated.json";
import { UI_MESSAGE_DEFINITIONS, type UiMessageDefinition } from "../../src/i18n/uiMessageDefinitions";

export const UI_MESSAGE_INVENTORY: Readonly<Record<string, UiMessageDefinition & { catalogKey: string }>> = {
  ...inventory,
  ...Object.fromEntries(Object.entries(UI_MESSAGE_DEFINITIONS).map(([id, definition]) => [id, { ...definition, catalogKey: id }])),
};

export function getUiMessageInventoryDefinition(id: string): (UiMessageDefinition & { catalogKey: string }) | undefined {
  return Object.prototype.hasOwnProperty.call(UI_MESSAGE_INVENTORY, id) ? UI_MESSAGE_INVENTORY[id] : undefined;
}
