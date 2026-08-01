import {
  BLUR_ATTRIBUTE,
  PALETTE_ATTRIBUTE,
  PALETTE_LAB_OVERRIDE_STYLE_ID,
  PALETTE_LAB_STORAGE_KEY,
  userLayerSelector,
} from "./paletteLabStorage";
import { BLUR_TOKEN_ID } from "./flatnessAxes";

/**
 * The Theme Lab's pre-paint bootstrap.
 *
 * The runtime restores a saved theme on every load, but it can only do so once
 * React has hydrated — so a customized visitor still saw one frame of the stock
 * site. This script runs from `<head>`, before the body is parsed, and does the
 * two things a first paint needs:
 *
 * 1. sets `html[data-palette]`, which switches on the shipped preset's block in
 *    the generated stylesheet (already downloaded, already parsed);
 * 2. injects the visitor's *own* layer — a custom slot's tokens plus their edits
 *    — as `#palette-lab-overrides`, at the same (0,2,1) specificity as those
 *    preset blocks, so their explicit edits win on source order rather than on
 *    the accident of being appended late.
 *
 * Rendered as a raw inline `<script>`: the framework's `beforeInteractive`
 * strategy compiles to a body-side queue push, which is after the head has been
 * parsed and too late to be a *pre*-paint restore.
 *
 * **The emitted string is a constant.** No preset data, no flavor, no build
 * stamp — nothing that could change between deploys, because its sha256 is
 * pinned in the dev-route CSP and a churning hash is a broken page. Adding a
 * preset changes the generated stylesheet, never this script.
 *
 * The parsing here is deliberately a loose echo of `parseStoredEnvelope` rather
 * than a shared import: it must stay tiny, dependency-free, and it only has to
 * be right about the *rendered* result. Anything it cannot make sense of it
 * leaves alone, and the runtime applies the same state again after hydration.
 */
export function buildPaletteLabBootstrapScript(): string {
  const storageKey = JSON.stringify(PALETTE_LAB_STORAGE_KEY);
  const styleId = JSON.stringify(PALETTE_LAB_OVERRIDE_STYLE_ID);
  const attribute = JSON.stringify(PALETTE_ATTRIBUTE);
  const blurAttribute = JSON.stringify(BLUR_ATTRIBUTE);
  const blurToken = JSON.stringify(BLUR_TOKEN_ID);
  const darkSelector = JSON.stringify(userLayerSelector("dark"));
  const lightSelector = JSON.stringify(userLayerSelector("light"));

  return `(() => {
  const KEY = ${storageKey};
  const STYLE_ID = ${styleId};
  const ATTR = ${attribute};
  const BLUR_ATTR = ${blurAttribute};
  const BLUR = ${blurToken};
  const SELECTORS = { dark: ${darkSelector}, light: ${lightSelector} };

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return;

    let paletteId = "";
    let layers = [];

    if (saved.version === 3) {
      const ref = saved.activeThemeRef || {};
      const custom = ref.kind === "custom";
      const edits = (saved.editsByPreset || {})[custom ? "custom:" + ref.id : ref.id];
      if (custom) {
        const slots = Array.isArray(saved.customThemes) ? saved.customThemes : [];
        for (const slot of slots) {
          if (!slot || slot.id !== ref.id) continue;
          paletteId = typeof slot.basePresetId === "string" ? slot.basePresetId : "";
          layers = [slot.overrides, edits];
        }
      } else if (typeof ref.id === "string") {
        paletteId = ref.id;
        layers = [edits];
      }
    } else if (saved.version === 2) {
      paletteId = typeof saved.presetId === "string" ? saved.presetId : "";
      layers = [saved.overrides];
    } else if (saved.version === undefined) {
      layers = [saved];
    }

    if (paletteId) document.documentElement.setAttribute(ATTR, paletteId);

    let css = "";
    let blurOff = false;
    for (const theme of ["dark", "light"]) {
      const merged = {};
      for (const layer of layers) {
        const map = layer && layer[theme];
        if (!map || typeof map !== "object") continue;
        for (const token of Object.keys(map)) {
          if (token.slice(0, 2) !== "--" || typeof map[token] !== "string") continue;
          merged[token] = map[token];
        }
      }
      if (merged[BLUR] && merged[BLUR].trim() === "off") blurOff = true;
      const tokens = Object.keys(merged);
      if (tokens.length === 0) continue;
      css += SELECTORS[theme] + "{";
      for (const token of tokens) css += token + ":" + merged[token] + ";";
      css += "}";
    }
    // Blur lives in the visitor's own layer, so their explicit switch is
    // pre-paint. A shipped preset that flattens blur is corrected at
    // hydration instead — preset data must never enter this constant script.
    if (blurOff) document.documentElement.setAttribute(BLUR_ATTR, "off");
    if (!css) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  } catch {}
})();`;
}
