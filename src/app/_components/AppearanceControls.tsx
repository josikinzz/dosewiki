"use client";

import { SessionContext } from "next-auth/react";
import { useContext, useEffect, useState } from "react";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useTheme } from "@/context/ThemeContext";
import { readEditorHint } from "@/lib/auth/editorHint";
import { canAccessDev } from "@/lib/auth/roles";
import { AppearanceCog } from "./AppearanceCog";

/**
 * The reader's appearance control: one cog, wherever appearance is offered.
 *
 * One composition for every surface that offers appearance choices — the footer, the
 * homepage's floating control and the `/dev/kit` parity harness — so the same rows are
 * always presented, labelled and ordered the same way. The rows themselves live in
 * {@link AppearanceCog}; this resolves *which* of them a given build and reader may see,
 * because that is publication and role policy, never a caller decision:
 *
 * - The colour scheme is selectable on both publications, so it follows
 *   `showColorSchemeToggle`.
 * - The visual style is locked on a publication whose identity *is* one style (Effect Index
 *   is Pro). Under that lock `setVisualStyle` is a no-op, so the row is not rendered at all
 *   rather than rendered inert. The lock is read from the provider, which is the only thing
 *   that knows whether the axis is actually writable.
 * - The accent axis locks on the same terms, via `showAccentPicker`.
 * - The Palette Lab entry points at an editor route. A reader who follows it gets a sign-in wall,
 *   so for a reader the control is absent rather than shown and broken.
 *
 * `className` lands on the cog's trigger, with no wrapper in between: the homepage's
 * search-mode rules reposition the control by class, and an intermediate element would take
 * the offset while the button kept its old place.
 */
export function AppearanceControls({ className }: { className?: string }) {
  const { isVisualStyleLocked, isAccentLocked } = useTheme();

  /**
   * Two answers to "is an editor looking at this", because the surfaces disagree about what is
   * available to ask.
   *
   * Inside `/dev` and `/review` the session context exists and knows the *role*, so it is
   * authoritative there: an `authenticated` `viewer` is answered `false` and the hint below is not
   * allowed to argue. `useSession()` is deliberately not used — it throws without a mounted
   * `<SessionProvider />` — and reading the context it would have read answers the same question
   * one layer lower.
   *
   * Everywhere else the context is `undefined`, and that is far more of the site than it looks:
   * `src/app/layout.tsx:110` renders the footer as a *sibling* of `{children}`, so even on `/dev`
   * the footer's cog sits outside `src/app/dev/layout.tsx:4`'s `AppProviders`. Which means this
   * gate was closed everywhere but `/dev/kit` until the fallback existed — the Lab entry never
   * reached the footer at all. Those surfaces now read {@link readEditorHint}, a browser-local flag
   * with no identity in it. It is a hint and never a gate: the route itself is guarded by
   * `middleware.ts:186-214` and `src/app/dev/themes/page.tsx:31-41`, and does not exist on Effect
   * Index. See that module for the whole argument, including what a stale hint costs.
   *
   * The hint is read after mount rather than during render, the way `ThemeContext` waits for its
   * own bootstrap read (`src/context/ThemeContext.tsx:168-174`) and `usePrefersReducedMotion` waits
   * for `matchMedia` (`src/hooks/usePrefersReducedMotion.ts:12-14`). `localStorage` does not exist
   * on the server, so a render-time read would have the server emit no control and the client emit
   * one for the same markup.
   */
  const session = useContext(SessionContext);
  const isEditorSession =
    session?.status === "authenticated" && canAccessDev(session.data.user?.role);
  const [hasEditorHint, setHasEditorHint] = useState(false);

  useEffect(() => {
    setHasEditorHint(readEditorHint());
  }, []);

  // `loading` is not yet an answer, so it defers to the hint rather than hiding the control and
  // then producing it a moment later.
  const isEditor = session && session.status !== "loading" ? isEditorSession : hasEditorHint;

  return (
    <AppearanceCog
      className={className}
      showVisualStyle={!isVisualStyleLocked}
      showColorScheme={SITE_FLAVOR_CONFIG.showColorSchemeToggle}
      showAccent={!isAccentLocked}
      showMoreSettings={isEditor}
    />
  );
}
