"use client";

import type { ColorScheme } from "@/context/ThemeContext";
import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { PANEL_ICON, PanelBadge, PanelRow } from "./panelKit";
import {
  ESSENTIALS,
  PALETTE_GROUPS,
  getToken,
  isInertInTheme,
  tokenThemeScope,
  type PaletteToken,
} from "./paletteTokens";
import { getLengthSpec } from "./paletteTokensRadius";
import { fontChoiceForValue } from "./paletteTokensFonts";
import { angleValue, formatAngle, hueSwatchColor } from "./paletteTokensHues";
import { describeColor, parseChannelsToRgba, parseColorToRgba } from "./colorUtils";
import styles from "./ThemeLab.module.css";

/**
 * The Theme Lab's three catalog depths — Essentials, All colors, Identical.
 *
 * Extracted from the panel component so the rows could be rebuilt on the shared
 * kit without pushing `ThemeLab.tsx` past its LOC budget, and so all three
 * depths render one row object instead of three near-copies.
 */

export interface ColorGroup {
  key: string;
  value: string;
  ids: string[];
  firstIndex: number;
}

/**
 * "You changed this" on a catalog row. A colored dot alone fails anyone who
 * cannot separate it from the swatch beside it, so the state is carried by a
 * pencil glyph plus an accessible name — shape and text, not hue.
 */
function ChangedMark() {
  return (
    <span className={styles.tokenDot} role="img" aria-label="changed">
      <Icon icon="lucide:pencil" size={10} />
    </span>
  );
}

/** The alpha-checkerboarded color chip shared by rows and the picker menu. */
export function TokenSwatch({ background }: { background: string }) {
  return (
    <span className={styles.tokenSwatch} aria-hidden="true">
      <span className={styles.tokenSwatchFill} style={{ background }} />
    </span>
  );
}

/** A length token has no color to show, so its row chip wears its own value —
 *  the corner shape *is* the swatch. */
function RadiusSwatch({ value }: { value: string }) {
  return <span className={styles.radiusSwatch} style={{ borderRadius: value }} aria-hidden="true" />;
}

/** A font token's chip is two letters set in the face it names — and, for a face
 *  whose `@font-face` has not been registered yet, in that face's own fallback,
 *  so listing the catalog never costs a download.
 *
 *  The picker's rows wear this same chip: {@link FontField} imports it rather
 *  than keeping a second copy, so the two never drift.
 *
 *  The border reads the `dose-border-strong` Tailwind alias rather than naming
 *  the theme custom property inside an arbitrary value. It expands to the same
 *  declaration, but the alias is the form `src/theme`'s token audit is there to
 *  keep feature TSX on — the audit scans comments too, so do not spell the raw
 *  custom-property reference out here either. */
export function FontSwatch({ value }: { value: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-[1.125rem] w-[1.375rem] shrink-0 items-center justify-center rounded-[0.3125rem] border border-dose-border-strong text-[0.625rem] font-semibold leading-none"
      // `inherit` for a token with no face of its own to show (the theme-default
      // row): it shows whatever the panel is already set in.
      style={{ fontFamily: value || "inherit" }}
    >
      Aa
    </span>
  );
}

/** A hue seed is an angle, not a color, so its chip is a *sample* of the family
 *  that angle derives — the one thing that makes "326" mean something on sight.
 *  Round, to say "this is a position on a circle" rather than a paint value.
 *
 *  Like {@link FontSwatch}, the border reads the `dose-border-strong` Tailwind
 *  alias rather than naming the theme custom property in an arbitrary value —
 *  the same declaration, in the form `src/theme`'s token audit keeps feature
 *  TSX on (the audit scans comments too, so do not spell it out here either). */
function HueSwatch({ value }: { value: string }) {
  return (
    <span
      aria-hidden="true"
      className="h-[1.125rem] w-[1.125rem] shrink-0 rounded-full border border-dose-border-strong"
      style={{ background: hueSwatchColor(Number(value)) }}
    />
  );
}

function ScopeBadge({ id }: { id: string }) {
  const scope = tokenThemeScope(id);
  return (
    <PanelBadge variant="outline" title={`Only affects the ${scope} theme`}>
      {scope} only
    </PanelBadge>
  );
}

interface RowProps {
  id: string;
  label: string;
  /** The already-resolved right-hand readout ("Deep violet", "gradient", …). */
  display: string;
  swatch: string;
  /** Which chip the row leads with; only lengths differ from a color swatch. */
  kind?: PaletteToken["kind"];
  active: boolean;
  changed: boolean;
  inert: boolean;
  shared?: number;
  raw?: boolean;
  sharedTitle?: string;
  onSelect: () => void;
}

/** One catalog row, whichever depth it is being listed from. */
function TokenRow({
  id,
  label,
  display,
  swatch,
  kind,
  active,
  changed,
  inert,
  shared = 1,
  raw = false,
  sharedTitle,
  onSelect,
}: RowProps) {
  return (
    <li>
      <PanelRow active={active} inert={inert} onClick={onSelect}>
        {kind === "length" ? (
          <RadiusSwatch value={swatch} />
        ) : kind === "font" ? (
          <FontSwatch value={swatch} />
        ) : kind === "angle" ? (
          <HueSwatch value={swatch} />
        ) : (
          <TokenSwatch background={swatch} />
        )}
        <span className={styles.tokenLabel}>
          {label}
          {raw && <PanelBadge variant="outline">raw</PanelBadge>}
          {inert && <ScopeBadge id={id} />}
          {shared > 1 && (
            <PanelBadge variant="default" title={sharedTitle}>
              ×{shared}
            </PanelBadge>
          )}
        </span>
        <span className={styles.tokenValue}>{display}</span>
        {changed && <ChangedMark />}
      </PanelRow>
    </li>
  );
}

/** The row readout, resolved exactly as each token kind stores its value. */
function readout(token: PaletteToken | undefined, value: string) {
  if (token?.kind === "raw") return "gradient";
  if (token?.kind === "length") return lengthValue(token.id, value);
  // The seed is stored bare (`326`), which reads as a quantity of nothing; the
  // degree sign is what says "position on the color circle".
  if (token?.kind === "angle") return `${formatAngle(angleValue(token.id, value))}°`;
  // The stack itself is unreadable in a 6rem column; the offered face's name is
  // what the row is actually about (and "Theme default" when it is none of them).
  if (token?.kind === "font") return fontChoiceForValue(value).label;
  const parsed =
    token?.kind === "channels" ? parseChannelsToRgba(value) : parseColorToRgba(value);
  return parsed ? describeColor(parsed) : value;
}

/** A length the browser has not resolved (jsdom, or a not-yet-emitted variable)
 *  still has an authored default, and showing that beats showing a blank row. */
function lengthValue(id: string, value: string) {
  return value.trim() || getLengthSpec(id)?.fallback || "";
}

function EmptyResults() {
  return <p className={styles.mergedHint}>No colors match your search.</p>;
}

interface CatalogProps {
  theme: ColorScheme;
  query: string;
  selectedToken: string | null;
  currentValue: (id: string) => string;
  isOverridden: (id: string) => boolean;
  onSelect: (id: string) => void;
}

/** Swatch value: channel tokens store `R G B`, not a CSS color; a length token's
 *  "swatch" is the radius its chip wears. */
function swatchFor(token: PaletteToken | undefined, value: string) {
  if (token?.kind === "channels") return `rgb(${value})`;
  if (token?.kind === "length") return lengthValue(token.id, value);
  // A hue seed's "swatch" is the angle itself; the chip turns it into a color.
  if (token?.kind === "angle") return String(angleValue(token.id, value));
  // A font token's "swatch" is the stack it resolves to, worn by the chip.
  if (token?.kind === "font") return fontChoiceForValue(value).stack;
  return value;
}

export function EssentialsView({
  theme,
  query,
  selectedToken,
  currentValue,
  isOverridden,
  onSelect,
}: CatalogProps) {
  const groups = ESSENTIALS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        query.length === 0 ||
        item.label.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query),
    ),
  })).filter((group) => group.items.length > 0);

  if (groups.length === 0) return <EmptyResults />;

  return (
    <>
      {groups.map((group) => (
        <section key={group.id} className={styles.group}>
          <div className={styles.essentialHead}>
            <span className={styles.groupTitle}>{group.title}</span>
          </div>
          {group.blurb && <p className={styles.essentialBlurb}>{group.blurb}</p>}
          <ul className={styles.tokenList}>
            {group.items.map((item) => {
              const token = getToken(item.id);
              if (!token) return null;
              const value = currentValue(item.id);
              return (
                <TokenRow
                  key={item.id}
                  id={item.id}
                  label={item.label}
                  display={readout(token, value)}
                  swatch={swatchFor(token, value)}
                  kind={token.kind}
                  active={selectedToken === item.id}
                  changed={isOverridden(item.id)}
                  inert={isInertInTheme(item.id, theme)}
                  onSelect={() => onSelect(item.id)}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

interface SectionsProps extends CatalogProps {
  expanded: Set<string>;
  sharedCounts: Map<string, number>;
  onToggleGroup: (id: string) => void;
}

export function SectionsView({
  theme,
  query,
  selectedToken,
  currentValue,
  isOverridden,
  onSelect,
  expanded,
  sharedCounts,
  onToggleGroup,
}: SectionsProps) {
  const matches = (token: PaletteToken) =>
    query.length === 0 ||
    token.label.toLowerCase().includes(query) ||
    token.id.toLowerCase().includes(query);

  const groups = PALETTE_GROUPS.map((group) => ({
    ...group,
    visibleTokens: group.tokens.filter(matches),
  })).filter((group) => group.visibleTokens.length > 0);

  if (groups.length === 0) return <EmptyResults />;

  return (
    <>
      {groups.map((group) => {
        const isOpen = query.length > 0 || expanded.has(group.id);
        return (
          <section key={group.id} className={styles.group}>
            <Button
              type="button"
              variant="ghost"
              size="auto"
              className={cn(
                styles.groupHeader,
                PANEL_ICON[16],
                "w-full min-h-8 justify-start gap-2 rounded-none px-1.5 py-2 text-left text-[0.8125rem] font-semibold [@media(pointer:coarse)]:min-h-11",
              )}
              aria-expanded={isOpen}
              onClick={() => onToggleGroup(group.id)}
            >
              <span
                className={`${styles.groupCaret} ${isOpen ? styles.groupCaretOpen : ""}`}
                aria-hidden="true"
              >
                <Icon icon="lucide:chevron-right" size={16} />
              </span>
              <span className={styles.groupTitle}>{group.title}</span>
              <span className={styles.groupCount}>{group.tokens.length}</span>
            </Button>
            {isOpen && (
              <>
                {group.blurb && <p className={styles.groupBlurb}>{group.blurb}</p>}
                <ul className={styles.tokenList}>
                  {group.visibleTokens.map((token) => {
                    const value = currentValue(token.id);
                    return (
                      <TokenRow
                        key={token.id}
                        id={token.id}
                        label={token.label}
                        display={readout(token, value)}
                        swatch={swatchFor(token, value)}
                        kind={token.kind}
                        raw={token.kind === "raw"}
                        shared={sharedCounts.get(token.id) ?? 1}
                        sharedTitle={`Shared by ${sharedCounts.get(token.id) ?? 1} tokens — open the Identical view to edit them together.`}
                        active={selectedToken === token.id}
                        changed={isOverridden(token.id)}
                        inert={isInertInTheme(token.id, theme)}
                        onSelect={() => onSelect(token.id)}
                      />
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}

interface MergedProps {
  groups: ColorGroup[];
  query: string;
  activeKey: string | null;
  theme: ColorScheme;
  onSelect: (repId: string) => void;
  isOverridden: (id: string) => boolean;
}

export function MergedView({
  groups,
  query,
  activeKey,
  theme,
  onSelect,
  isOverridden,
}: MergedProps) {
  const visible = groups.filter((group) => {
    if (!query) return true;
    if (group.value.toLowerCase().includes(query)) return true;
    return group.ids.some((id) => {
      const token = getToken(id);
      return token?.label.toLowerCase().includes(query) || token?.id.toLowerCase().includes(query);
    });
  });

  if (visible.length === 0) return <EmptyResults />;

  return (
    <ul className={styles.tokenList}>
      {visible.map((group) => {
        const parsed = parseColorToRgba(group.value);
        return (
          <TokenRow
            key={group.key}
            id={group.ids[0]}
            label={getToken(group.ids[0])?.label ?? group.ids[0]}
            display={parsed ? describeColor(parsed) : group.value}
            swatch={group.value}
            shared={group.ids.length}
            sharedTitle={`Editing all ${group.ids.length} of these tokens together.`}
            active={activeKey === group.key}
            changed={group.ids.some(isOverridden)}
            // Merged rows only read as inert when *every* member is inert —
            // one live token means editing here still changes the page.
            inert={group.ids.every((id) => isInertInTheme(id, theme))}
            onSelect={() => onSelect(group.ids[0])}
          />
        );
      })}
    </ul>
  );
}

/** The picker menu paints the same swatch, so it shares the same rule. */
export function channelSwatch(id: string, value: string) {
  return swatchFor(getToken(id), value);
}
