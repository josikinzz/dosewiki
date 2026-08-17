"use client";

import { SessionContext } from "next-auth/react";
import { useContext } from "react";

import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import { useTheme } from "@/context/ThemeContext";
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
 * - "More settings" points at the Theme Lab, an editor route. A reader who follows it gets a
 *   sign-in wall, so for a reader the row is absent rather than shown and broken.
 *
 * `className` lands on the cog's trigger, with no wrapper in between: the homepage's
 * search-mode rules reposition the control by class, and an intermediate element would take
 * the offset while the button kept its old place.
 */
export function AppearanceControls({ className }: { className?: string }) {
  const { isVisualStyleLocked, isAccentLocked } = useTheme();

  /**
   * The same session and the same role policy the `/dev` shell routes on
   * (`useDevRouteAccess` → `canAccessDev`), read one layer lower.
   *
   * `useSession()` throws without a mounted `<SessionProvider />`, and the public tree does
   * not mount one — only `/dev` and `/review` wrap themselves in `AppProviders`. Reading the
   * context it would have read answers the question on every surface instead: outside a
   * provider the value is `undefined`, which is exactly "no editor is looking at this".
   */
  const session = useContext(SessionContext);
  const isEditor = session?.status === "authenticated" && canAccessDev(session.data.user?.role);

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
