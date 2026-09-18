import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type CategoryTabContent,
  hasCategoryTabContent,
} from "../../data/categoryTabContent";

/**
 * Markdown components map for the category definition. Mirrors the site
 * convention from `ProfileBioMarkdown` so prose, emphasis, and links read the
 * same across surfaces, with one deliberate change: the leading **bold**
 * category name carries the strong accent token so it reads as a confident
 * editorial lead-in, while etymology italics step down to the faint tier so
 * they stay quiet.
 */
const introComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p
      // Compact article-adjacent prose: a body-scale size with enough leading
      // for light-on-dark readability, but no hero-intro looseness.
      className="theme-text-secondary text-pretty text-[0.96875rem] leading-[1.62] sm:text-base sm:leading-[1.66] first:mt-0"
      {...props}
    />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => (
    <strong className="theme-accent-emphasis font-semibold" {...props} />
  ),
  em: ({ node: _node, ...props }: { node?: unknown }) => (
    // Etymology glosses: lighter tier, quiet — never compete with the lead-in.
    <em className="theme-text-faint italic" {...props} />
  ),
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="theme-profile-markdown-link font-medium transition hover:underline hover:underline-offset-2"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
};

interface CategoryIntroProps {
  /** Intro content for the active substance-index tab. */
  content: CategoryTabContent | undefined;
  /** Active tab id — used to re-key the block so it refreshes per tab. */
  activeTab: string;
  /**
   * Show the gradient hairline rule above the prose. Defaults to true. The
   * Chemical Class Index sets this false because it places the divider above its
   * molecule gallery instead.
   */
  showDivider?: boolean;
}

/**
 * Intro blurb shown between the substance-index filter tabs and the category
 * panels. Renders a one-paragraph Markdown introduction for the active tab
 * as free-floating editorial prose — no boxy card — left-aligned within a
 * centered ~70ch reading column and anchored by a gradient hairline rule that
 * spans the column, echoes the index-list divider language, and ties the
 * paragraph back to the tab strip above it. The matching treatment is shared
 * with the Subjective Effect Index intro (`SEIIntroSection`) so the two
 * indexes read as the same element.
 *
 * Re-keyed on `activeTab` so switching tabs replays the project's measured
 * entrance (`theme-section-card-enter` — fade + 12px rise, matching
 * `cardAnimation`); that utility carries its own `prefers-reduced-motion`
 * guard, so the entrance is suppressed for reduced-motion users.
 *
 * NOTE: `content.warning` is intentionally left un-surfaced for now — it is
 * wired through on the type and reserved for a later category-warning
 * treatment (a distinct, more prominent affordance than this calm definition).
 */
export function CategoryIntro({ content, activeTab, showDivider = true }: CategoryIntroProps) {
  if (!hasCategoryTabContent(content) || !content.definition) return null;

  return (
    // `key={activeTab}` remounts on tab change so the shared site entrance
    // (`theme-section-card-enter` = fade + 12px rise, 420ms, the same recipe
    // as `cardAnimation`) replays per category. That utility carries its own
    // `prefers-reduced-motion` guard, so no extra motion gating is needed here.
    <section
      key={activeTab}
      aria-label="Substance index tab introduction"
      className="theme-section-card-enter mx-auto mt-6 flex max-w-[70ch] flex-col px-4 text-left sm:mt-7"
    >
      {/* Hairline rule: the site's gradient index divider, spanning the reading
          column and sitting flush above the left-aligned prose — brightest
          mid-span, fading to nothing at the edges. Purely decorative; ties the
          prose to the tabs above. */}
      {showDivider ? <span aria-hidden className="theme-horizontal-divider" /> : null}

      <div className={showDivider ? "mt-4" : undefined}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={introComponents}>
          {content.definition}
        </ReactMarkdown>
      </div>
    </section>
  );
}
