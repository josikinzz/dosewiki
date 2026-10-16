import type { PaletteGroup, PaletteToken } from "./paletteTokens";

const raw = (id: string, label: string, hint?: string): PaletteToken => ({
  id,
  label,
  kind: "raw",
  hint,
});

export const BLUR_GROUP: PaletteGroup = {
  id: "blur",
  title: "Backdrop blur",
  blurb:
    "Frosted-glass blur behind panels and overlays. `on` (default) or `off`. Off disables it site-wide, which flat looks want and slow GPUs appreciate.",
  tokens: [
    raw(
      "--theme-backdrop-blur",
      "Backdrop blur",
      "`on` or `off`. Off flattens every frosted surface site-wide.",
    ),
  ],
};

export const ELEVATION_GROUP: PaletteGroup = {
  id: "elevation",
  title: "Elevation (shadow depth)",
  blurb:
    "Complete box-shadow values, one per shadow the site asks for by name. The soft and strong Shadow colors above tint most of them; these control the geometry. Set one to `0 0 #0000` to flatten that shadow site-wide.",
  tokens: [
    raw("--theme-elevation-none", "None", "A deliberately absent shadow: 0 0 #0000."),
    raw("--theme-elevation-sm", "Scale: small", "Docs cards, chips, active tabs."),
    raw("--theme-elevation-lg", "Scale: large", "Dialogs, dropdowns, command palette."),
    raw("--theme-elevation-xl", "Scale: extra large", "Header menus, search overlays, wide tables."),
    raw("--theme-elevation-2xl", "Scale: 2x large", "Article hero."),
    raw("--theme-elevation-inner", "Scale: inner", "Sunken code blocks and read-only fields."),
    raw("--theme-elevation-card", "Card"),
    raw("--theme-elevation-card-subtle", "Card: subtle"),
    raw("--theme-elevation-overlay", "Overlay / card hover", "Popovers, submenus, and the card hover lift."),
    raw("--theme-elevation-panel", "Panel"),
    raw("--theme-elevation-panel-deep", "Panel: deep"),
    raw("--theme-elevation-tile-hover", "Gallery tile: hover"),
    raw("--theme-elevation-motion-card", "Motion card"),
    raw("--theme-elevation-motion-card-hover", "Motion card: hover"),
    raw("--theme-elevation-swatch", "Color swatch"),
    raw("--theme-elevation-accent-lift", "Accent lift"),
    raw("--theme-elevation-accent-ring", "Accent hairline ring"),
    raw("--theme-elevation-danger", "Danger card"),
    raw("--theme-elevation-danger-hover", "Danger card: hover"),
    raw("--theme-elevation-control-active", "Control: active"),
    raw("--theme-elevation-control-primary", "Control: primary"),
    raw("--theme-elevation-icon-tile", "Icon tile"),
    raw("--theme-elevation-field-inset", "Field inset"),
    raw("--theme-elevation-inner-accent", "Inset: accent"),
    raw("--theme-elevation-top-highlight", "Top edge highlight"),
    raw("--theme-elevation-top-highlight-faint", "Top edge highlight: faint"),
    raw("--theme-elevation-mark-hairline", "Search mark hairline"),
    raw("--theme-elevation-avatar-inner", "Avatar inset"),
    raw("--theme-elevation-avatar-glow", "Avatar glow"),
  ],
};
