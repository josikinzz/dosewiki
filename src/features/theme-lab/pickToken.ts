/**
 * Eyedropper reverse-mapping: given a clicked DOM element, work out which
 * editable `--theme-*` token(s) actually color it.
 *
 * Why CSSOM matching rather than sampling the pixel: the rendered pixel is the
 * blended result of gradients / `color-mix()` / opacity, so it maps back to no
 * single token. Instead we read the CSS *rules* that match the element and
 * collect the `var(--theme-*)` references in their fill / text / border
 * declarations. That yields the token regardless of how the color was applied
 * (utility class, Tailwind arbitrary value, inline). Hardcoded-hex spots
 * resolve to nothing — honestly surfacing the parts that aren't themed yet.
 */

import { PICK_EXPANSIONS, PICK_REDIRECTS, getEssential, getToken } from "./paletteTokens";

export type PickRole = "fill" | "text" | "border";

export interface PickCandidate {
  role: PickRole;
  id: string;
  label: string;
}

interface WeightedToken {
  id: string;
  /** Rough visible contribution 0-100: a `color-mix(... var() N%, …)` stop
   *  counts as N; a bare `var()` counts as 100. Lets us prefer the stop that
   *  actually dominates a translucent gradient instead of the faintest one. */
  weight: number;
  /** Prefer visible background images/shorthands over fallback background-color
   * tokens. A class such as `.backdrop-safe` can carry a background-color
   * fallback while another class paints the actual gradient. */
  propertyPriority: number;
  important: boolean;
}

interface ThemeRule {
  selector: string;
  specificity: number;
  order: number;
  roleTokens: Partial<Record<PickRole, WeightedToken[]>>;
}

export type ThemeRuleIndex = ThemeRule[];

const PSEUDO_STATE = /:(hover|focus|focus-visible|focus-within|active|target|visited|checked)\b/;
const PSEUDO_ELEMENT = /::/;
const EDITABLE_VAR = /var\(\s*--(?:theme|site-logo|c)-/;

function roleForProperty(prop: string): PickRole | null {
  if (prop === "color" || prop === "-webkit-text-fill-color") return "text";
  if (prop.startsWith("background")) return "fill";
  if (prop === "outline" || prop.startsWith("outline-")) return "border";
  if (prop === "border" || (prop.startsWith("border") && prop.includes("color"))) return "border";
  return null;
}

function visibilityPriority(prop: string, role: PickRole): number {
  if (role !== "fill") return 1;
  if (prop === "background" || prop === "background-image") return 3;
  if (prop === "background-color") return 1;
  return 2;
}

function extractWeightedTokens(
  value: string,
  propertyPriority: number,
  important: boolean,
): WeightedToken[] {
  const out: WeightedToken[] = [];
  const defaultWeight = value.includes("color-mix(") ? 50 : 100;
  // Capture the optional `N%` that follows a token inside a color-mix stop.
  const re = /var\(\s*(--(?:theme|site-logo|c)-[a-z0-9-]+)\s*\)(?:\s*(\d+(?:\.\d+)?)\s*%)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    out.push({
      id: m[1],
      weight: m[2] !== undefined ? parseFloat(m[2]) : defaultWeight,
      propertyPriority,
      important,
    });
  }
  return out;
}

/** Coarse specificity for ranking matched rules; exact CSS math isn't needed. */
function specificity(sel: string): number {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const classes =
    (sel.match(/\.[\w-]+/g) || []).length +
    (sel.match(/\[[^\]]+\]/g) || []).length +
    (sel.match(/:[\w-]+/g) || []).length;
  const types = (sel.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return ids * 10000 + classes * 100 + types;
}

function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return (
    "selectorText" in rule &&
    "style" in rule &&
    !!(rule as CSSStyleRule).style
  );
}

function isGroupingRule(rule: CSSRule): rule is CSSGroupingRule {
  return "cssRules" in rule && !!(rule as CSSGroupingRule).cssRules;
}

function mediaTextFor(rule: CSSRule): string | null {
  if (!("media" in rule)) return null;
  const media = (rule as CSSMediaRule).media;
  return media?.mediaText ?? null;
}

function* iterStyleRules(rules: CSSRuleList): Generator<CSSStyleRule> {
  for (const rule of Array.from(rules)) {
    if (isStyleRule(rule)) {
      yield rule;
    } else if (isGroupingRule(rule)) {
      const mediaText = mediaTextFor(rule);
      if (mediaText) {
        try {
          if (!window.matchMedia(mediaText).matches) continue;
        } catch {
          /* unparseable media — fall through and descend */
        }
      }
      yield* iterStyleRules(rule.cssRules);
    }
  }
}

/**
 * Snapshot every currently-applicable rule that references a theme token,
 * pre-split and pre-classified, so per-element matching at click/hover time is
 * cheap. Built once when pick mode is armed; rebuilt when the edited theme
 * changes. Rules scoped to the *other* theme, and `:hover`/`:focus`/pseudo-
 * element rules, are dropped so we resolve the resting-state color.
 */
export function buildThemeRuleIndex(theme: string): ThemeRuleIndex {
  const other = theme === "dark" ? "light" : "dark";
  const otherRe = new RegExp(`\\[data-theme=["']?${other}["']?\\]`);
  const index: ThemeRuleIndex = [];
  let order = 0;

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin stylesheet — not readable
    }
    for (const rule of iterStyleRules(rules)) {
      const decl = rule.style;
      if (!decl || !EDITABLE_VAR.test(decl.cssText)) continue;

      const roleTokens: Partial<Record<PickRole, WeightedToken[]>> = {};
      for (let i = 0; i < decl.length; i++) {
        const prop = decl[i];
        const role = roleForProperty(prop);
        if (!role) continue;
        const val = decl.getPropertyValue(prop);
        if (!EDITABLE_VAR.test(val)) continue;
        const tokens = extractWeightedTokens(
          val,
          visibilityPriority(prop, role),
          decl.getPropertyPriority(prop) === "important",
        ).filter((t) => getToken(t.id));
        if (tokens.length) (roleTokens[role] ||= []).push(...tokens);
      }
      if (Object.keys(roleTokens).length === 0) continue;

      for (const part of (rule.selectorText || "").split(",")) {
        const sel = part.trim();
        if (!sel) continue;
        if (otherRe.test(sel)) continue;
        if (PSEUDO_STATE.test(sel) || PSEUDO_ELEMENT.test(sel)) continue;
        index.push({ selector: sel, specificity: specificity(sel), order: order++, roleTokens });
      }
    }
  }
  return index;
}

/**
 * The token that actually colors one role on one element: the winning rule by
 * importance, specificity, visible background priority, then source order. For
 * gradients/color-mix values, choose the dominant stop by weight.
 */
function betterToken(next: WeightedToken, current: WeightedToken): boolean {
  if (next.important !== current.important) return next.important;
  if (next.propertyPriority !== current.propertyPriority) {
    return next.propertyPriority > current.propertyPriority;
  }
  return next.weight >= current.weight;
}

function betterRuleCandidate(
  next: { token: WeightedToken; rule: ThemeRule },
  current: { token: WeightedToken; rule: ThemeRule } | null,
): boolean {
  if (!current) return true;
  if (next.token.important !== current.token.important) return next.token.important;
  if (next.rule.specificity !== current.rule.specificity) {
    return next.rule.specificity > current.rule.specificity;
  }
  if (next.token.propertyPriority !== current.token.propertyPriority) {
    return next.token.propertyPriority > current.token.propertyPriority;
  }
  return next.rule.order >= current.rule.order;
}

function bestTokenForRoleFromMatchedCss(el: Element, role: PickRole): string | null {
  let best: { token: WeightedToken; rule: ThemeRule } | null = null;
  let order = 0;

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of iterStyleRules(rules)) {
      const tokens = tokensForDeclarationRole(rule.style, role);
      if (!tokens.length) continue;

      for (const part of (rule.selectorText || "").split(",")) {
        const selector = part.trim();
        if (!selector || PSEUDO_STATE.test(selector) || PSEUDO_ELEMENT.test(selector)) continue;

        let matches = false;
        try {
          matches = el.matches(selector);
        } catch {
          continue;
        }
        if (!matches) continue;

        const candidateRule: ThemeRule = {
          selector,
          specificity: specificity(selector),
          order: order++,
          roleTokens: { [role]: tokens },
        };
        const dominant = tokens.reduce((a, b) => (betterToken(b, a) ? b : a));
        if (betterRuleCandidate({ token: dominant, rule: candidateRule }, best)) {
          best = { token: dominant, rule: candidateRule };
        }
      }
    }
  }

  return best?.token.id ?? null;
}

function tokensForDeclarationRole(decl: CSSStyleDeclaration, role: PickRole): WeightedToken[] {
  const tokens: WeightedToken[] = [];
  for (let i = 0; i < decl.length; i++) {
    const prop = decl[i];
    if (roleForProperty(prop) !== role) continue;
    const val = decl.getPropertyValue(prop);
    if (!EDITABLE_VAR.test(val)) continue;
    tokens.push(
      ...extractWeightedTokens(
        val,
        visibilityPriority(prop, role),
        decl.getPropertyPriority(prop) === "important",
      ).filter((t) => getToken(t.id)),
    );
  }
  return tokens;
}

function roleForClassToken(token: string): PickRole | null {
  if (/^(text|fill|stroke)-\[/.test(token)) return "text";
  if (/^(bg|from|via|to)-\[/.test(token)) return "fill";
  if (/^(border|ring|outline|decoration)-\[/.test(token)) return "border";
  return null;
}

function bestTokenFromElementAuthoredValues(el: Element, role: PickRole): string | null {
  const semantic = semanticTokenForElement(el, role);
  if (semantic) return semantic;

  const values: string[] = [];
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i];
      if (roleForProperty(prop) === role) values.push(el.style.getPropertyValue(prop));
    }
  }

  for (const token of Array.from(el.classList)) {
    if (!EDITABLE_VAR.test(token)) continue;
    if (roleForClassToken(token) === role) values.push(token.replace(/_/g, " "));
  }

  const candidates = values.flatMap((value) =>
    extractWeightedTokens(value, 1, false).filter((token) => getToken(token.id)),
  );
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (betterToken(b, a) ? b : a)).id;
}

function semanticTokenForElement(el: Element, role: PickRole): string | null {
  if (role === "fill" && el.classList.contains("theme-dosewiki-logo")) {
    return "--theme-logo-fill";
  }
  return null;
}

function bestForRole(el: Element, role: PickRole, index: ThemeRuleIndex): string | null {
  let best: { token: WeightedToken; rule: ThemeRule } | null = null;
  for (const rule of index) {
    const tokens = rule.roleTokens[role];
    if (!tokens) continue;
    let matches = false;
    try {
      matches = el.matches(rule.selector);
    } catch {
      continue; // selector matches() can't parse (e.g. exotic syntax)
    }
    if (!matches) continue;
    const dominant = tokens.reduce((a, b) => (betterToken(b, a) ? b : a));
    if (betterRuleCandidate({ token: dominant, rule }, best)) {
      best = { token: dominant, rule };
    }
  }
  if (!hasVisiblePaint(el, role)) return null;
  return (
    best?.token.id ??
    bestTokenForRoleFromMatchedCss(el, role) ??
    bestTokenFromElementAuthoredValues(el, role)
  );
}

function alphaFromCssColor(value: string): number {
  const color = value.trim().toLowerCase();
  if (!color || color === "transparent") return 0;
  const slashAlpha = color.match(/\/\s*([0-9.]+%?)/);
  if (slashAlpha) {
    const raw = slashAlpha[1];
    return raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
  }
  const rgba = color.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return 1;
  const parts = rgba[1].split(/[\s,]+/).filter(Boolean);
  if (parts.length < 4) return 1;
  const raw = parts[3];
  return raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
}

function hasVisiblePaint(el: Element, role: PickRole): boolean {
  if (hasExplicitInlineHiddenPaint(el, role)) return false;

  const computed = getComputedStyle(el);
  if (role === "fill") {
    const image = computed.backgroundImage.trim();
    if (image && image !== "none") return true;
    return alphaFromCssColor(computed.backgroundColor) > 0 || isJsdom();
  }
  if (role === "text") {
    return alphaFromCssColor(computed.color) > 0 || isJsdom();
  }

  const sides = ["Top", "Right", "Bottom", "Left"] as const;
  return sides.some((side) => {
    const width = parseFloat(computed[`border${side}Width`]);
    const style = computed[`border${side}Style`];
    const color = computed[`border${side}Color`];
    return width > 0 && style !== "none" && style !== "hidden" && alphaFromCssColor(color) > 0;
  }) || isJsdom();
}

function isJsdom(): boolean {
  return navigator.userAgent.toLowerCase().includes("jsdom");
}

function hasExplicitInlineHiddenPaint(el: Element, role: PickRole): boolean {
  if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
  const style = el.style;
  if (role === "fill") {
    const background = style.background || style.backgroundColor || style.backgroundImage;
    return /^(transparent|none)$/i.test(background.trim());
  }
  if (role === "text") {
    const color = style.color.trim();
    return color !== "" && alphaFromCssColor(color) === 0;
  }
  return ["Top", "Right", "Bottom", "Left"].some((side) => {
    const width = style[`border${side}Width`];
    const borderStyle = style[`border${side}Style`];
    return width === "0px" || borderStyle === "none" || borderStyle === "hidden";
  });
}

function labelFor(id: string): string {
  return getEssential(id)?.label ?? getToken(id)?.label ?? id;
}

/**
 * Resolve the editable tokens for a click target, one per role. For fill and
 * text we walk up to the nearest ancestor that paints that role (so clicking
 * the text inside a panel still finds the panel's fill); border stays local.
 * Derived/gradient tokens are redirected to their friendly editable base
 * (e.g. the frosted-panel gradient → "Panel color").
 */
export function resolveTokensAt(start: Element, index: ThemeRuleIndex): PickCandidate[] {
  const roles: { role: PickRole; climb: boolean }[] = [
    { role: "fill", climb: true },
    { role: "text", climb: true },
    { role: "border", climb: false },
  ];
  const found: PickCandidate[] = [];

  for (const { role, climb } of roles) {
    let el: Element | null = start;
    let depth = 0;
    while (el && el !== document.documentElement && depth < 10) {
      const raw = bestForRole(el, role, index);
      if (raw) {
        const ids = PICK_EXPANSIONS[raw] ?? [PICK_REDIRECTS[raw] ?? raw];
        for (const id of ids) {
          found.push({ role, id, label: labelFor(id) });
        }
        break;
      }
      if (!climb) break;
      el = el.parentElement;
      depth += 1;
    }
  }
  return found;
}
