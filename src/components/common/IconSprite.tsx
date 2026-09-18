"use client";

import { createContext, useContext, type ReactNode } from "react";
import iconData from "./iconData.generated.json";

/**
 * Icons that a long page repeats: disclosure controls, reference backlinks,
 * category chips, and paired collapsed/expanded pharmacology cards. Each name
 * maps to the `<symbol>` id the sprite registers it under.
 *
 * Inside an `IconSpriteScope`, `Icon` renders these as a one-line
 * `<svg><use href="#id"/></svg>` instead of inlining the full glyph markup on
 * every occurrence.
 *
 * Deliberately small and explicit. A name is worth adding only when the same
 * article can render it more than once; one-off section icons stay on the
 * regular inline path.
 */
const SPRITE_ICON_IDS: Readonly<Record<string, string>> = {
  "lucide:ellipsis": "dw-icon-ellipsis",
  "lucide:chevron-down": "dw-icon-chevron-down",
  "lucide:arrow-up": "dw-icon-arrow-up",
  "lucide:key": "dw-icon-key",
  "lucide:tag": "dw-icon-tag",
  "material-symbols:track-changes-rounded": "dw-icon-track-changes-rounded",
};

type SpriteSymbol = {
  id: string;
  body: string;
  viewBox: string;
};

/** Resolve each sprite name against the offline icon bundle, once per module. */
function buildSpriteSymbols(): SpriteSymbol[] {
  const symbols: SpriteSymbol[] = [];
  for (const [name, id] of Object.entries(SPRITE_ICON_IDS)) {
    const separator = name.indexOf(":");
    const prefix = name.slice(0, separator);
    const iconName = name.slice(separator + 1);
    const collection = iconData.collections.find(
      (entry) => entry.prefix === prefix,
    );
    const icon = collection?.icons?.[
      iconName as keyof typeof collection.icons
    ] as
      | {
          body: string;
          width?: number;
          height?: number;
          left?: number;
          top?: number;
        }
      | undefined;
    if (!collection || !icon) continue;
    const left = icon.left ?? 0;
    const top = icon.top ?? 0;
    const width = icon.width ?? collection.width ?? 16;
    const height = icon.height ?? collection.height ?? 16;
    symbols.push({
      id,
      body: icon.body,
      viewBox: `${left} ${top} ${width} ${height}`,
    });
  }
  return symbols;
}

const SPRITE_SYMBOLS = buildSpriteSymbols();

const SPRITE_VIEWBOX_BY_ID = new Map(
  SPRITE_SYMBOLS.map((symbol) => [symbol.id, symbol.viewBox]),
);

/**
 * Look up how `Icon` should reference a sprited name: the symbol id and the
 * viewBox the referencing `<svg>` must carry so the glyph scales exactly as the
 * inline render did. `null` when the name is not in the sprite.
 */
export function getSpriteReference(
  icon: string,
): { id: string; viewBox: string } | null {
  const id = SPRITE_ICON_IDS[icon];
  if (!id) return null;
  const viewBox = SPRITE_VIEWBOX_BY_ID.get(id);
  return viewBox ? { id, viewBox } : null;
}

const IconSpriteContext = createContext(false);

/** Whether the nearest `IconSpriteScope` has mounted the sprite for this tree. */
export function useIconSpriteAvailable(): boolean {
  return useContext(IconSpriteContext);
}

/**
 * The hidden sprite itself: one `<symbol>` per entry in `SPRITE_ICON_IDS`.
 * Zero-sized and absolutely positioned rather than `display: none` so every
 * browser resolves `<use>` references into it.
 */
function IconSpriteDefinitions() {
  if (SPRITE_SYMBOLS.length === 0) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      data-icon-sprite=""
    >
      {SPRITE_SYMBOLS.map((symbol) => (
        <symbol
          key={symbol.id}
          id={symbol.id}
          viewBox={symbol.viewBox}
          dangerouslySetInnerHTML={{ __html: symbol.body }}
        />
      ))}
    </svg>
  );
}

/**
 * Mounts the sprite once and tells every `Icon` beneath it that `<use>`
 * references will resolve. Outside a scope `Icon` keeps inlining full glyphs,
 * so a page that never opts in cannot lose an icon to a missing sprite.
 */
export function IconSpriteScope({ children }: { children: ReactNode }) {
  return (
    <IconSpriteContext.Provider value={true}>
      <IconSpriteDefinitions />
      {children}
    </IconSpriteContext.Provider>
  );
}
