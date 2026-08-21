import type { ReactNode } from "react";
import { ContributorAvatar, IconPillLink } from "@/components/layout/PublicPagePrimitives";
import type { NormalizedUserProfile } from "@/data/userProfiles";

/**
 * The Artist Page's identity decoration: avatar, role, bio, and links from the
 * Contributor Profile that claims the focused credit line. Rendered on the
 * server by /replications/artist/[key] and handed to the gallery explorer as
 * its `focusIdentity` — the artist's name itself stays in the focus heading,
 * so nothing here repeats it. An unclaimed artist (and always the Unattributed
 * bucket) renders no card at all: same page shape, undecorated.
 */
export function ArtistFocusIdentity({
  profile,
  bio,
}: {
  profile: NormalizedUserProfile;
  /** The profile bio, already rendered as markdown; null renders no prose. */
  bio: ReactNode;
}) {
  const role = profile.role?.trim() ?? "";

  return (
    <section
      aria-label={`About ${profile.displayName || profile.key}`}
      data-testid="artist-identity"
      className="flex flex-wrap items-start gap-4 px-1"
    >
      <ContributorAvatar
        imageUrl={profile.avatarUrl}
        name={profile.displayName || profile.key}
        size="sm"
        lifted
      />
      <div className="min-w-0 flex-1 space-y-3">
        {role ? (
          <p className="theme-text-muted text-sm font-medium" data-testid="contributor-role">
            {role}
          </p>
        ) : null}
        {bio ? <div className="theme-text-secondary max-w-[72ch] text-sm">{bio}</div> : null}
        {profile.links.length > 0 ? (
          <nav
            aria-label={`${profile.displayName || profile.key} profile links`}
            className="flex flex-wrap gap-2"
          >
            {profile.links.map((link) => (
              <IconPillLink
                key={link.url}
                href={link.url}
                label={link.label}
                icon="lucide:link-2"
                external
              />
            ))}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
