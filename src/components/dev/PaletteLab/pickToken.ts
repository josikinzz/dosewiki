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

import { PICK_REDIRECTS, getEssential, getToken } from "./paletteTokens";

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
  // Capture the optional `N%` that follows a token inside a color-mix stop.
  const re = /var\(\s*(--theme-[a-z0-9-]+)\s*\)(?:\s*(\d+(?:\.\d+)?)\s*%)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    out.push({
      id: m[1],
      weight: m[2] !== undefined ? parseFloat(m[2]) : 100,
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

function* iterStyleRules(rules: CSSRuleList): Generator<CSSStyleRule> {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      yield rule;
    } else if (rule instanceof CSSGroupingRule) {
      if (rule instanceof CSSMediaRule) {
        try {
          if (rule.media.mediaText && !window.matchMedia(rule.media.mediaText).matches) continue;
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
      if (!decl || !decl.cssText.includes("var(--theme-")) continue;

      const roleTokens: Partial<Record<PickRole, WeightedToken[]>> = {};
      for (let i = 0; i < decl.length; i++) {
        const prop = decl[i];
        const role = roleForProperty(prop);
        if (!role) continue;
        const val = decl.getPropertyValue(prop);
        if (!val.includes("var(--theme-")) continue;
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
  return best?.token.id ?? null;
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
        const id = PICK_REDIRECTS[raw] ?? raw;
        found.push({ role, id, label: labelFor(id) });
        break;
      }
      if (!climb) break;
      el = el.parentElement;
      depth += 1;
    }
  }
  return found;
}
