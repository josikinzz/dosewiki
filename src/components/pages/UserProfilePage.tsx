import { type ReactNode } from "react";
import { AppImage } from "@/components/common/AppImage";
import { Icon } from "@/components/common/Icon";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import type { ReportCardModel } from "@/types/tripReport";
import { UserContributionsSection, UserTripReportsSection } from "./UserProfileExpandableSections";

interface UserProfilePageProps {
  profile: NormalizedUserProfile;
  history: ChangeLogEntry[];
  tripReports?: ReportCardModel[];
  reportHrefPrefix?: string;
  bioContent?: ReactNode;
}

const renderAvatar = (profile: NormalizedUserProfile) => {
  if (profile.avatarUrl) {
    return (
      <div className="relative group">
        <div className="absolute inset-0 rounded-full bg-fuchsia-500/20 blur-2xl transition duration-500 group-hover:bg-fuchsia-500/30 group-hover:blur-3xl" />
        <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-white/10 shadow-2xl shadow-black/50 ring-1 ring-white/20 transition duration-300 group-hover:border-fuchsia-500/30 group-hover:ring-fuchsia-500/30">
          <AppImage
            src={profile.avatarUrl}
            alt={`${profile.displayName} avatar`}
            width={128}
            height={128}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
            draggable={false}
          />
        </div>
      </div>
    );
  }

  const initials = profile.displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("") || profile.key.slice(0, 2).toUpperCase();

  return (
    <div className="relative group">
      <div className="absolute inset-0 rounded-full bg-fuchsia-500/20 blur-2xl transition duration-500 group-hover:bg-fuchsia-500/30 group-hover:blur-3xl" />
      <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-white/10 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/20 to-sky-500/20 text-4xl font-semibold text-fuchsia-100 shadow-2xl shadow-black/50 ring-1 ring-white/20 transition duration-300 group-hover:border-fuchsia-500/30 group-hover:ring-fuchsia-500/30">
        <span className="transition duration-500 group-hover:scale-110">{initials}</span>
      </div>
    </div>
  );
};

export function UserProfilePage({ profile, history, tripReports = [], reportHrefPrefix, bioContent }: UserProfilePageProps) {
  const hasLinks = profile.links.length > 0;
  const hasBio = profile.hasCustomBio;

  return (
    <main id="main-content" tabIndex={-1} className="theme-page-shell min-h-screen focus:outline-none">
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-12 md:px-8">
        <div className="flex flex-col items-center gap-8 text-center">
          {renderAvatar(profile)}
          
          <div className="flex flex-col items-center gap-6">
            <div>
              <h1 className="font-display break-words text-4xl font-bold tracking-tight text-fuchsia-300 sm:text-5xl">
                {profile.displayName}
              </h1>
              <p className="mt-2 text-lg font-medium text-fuchsia-300/80">
                @{profile.key.toLowerCase()}
              </p>
            </div>

            {hasLinks && (
              <div className="flex flex-wrap justify-center gap-3">
                {profile.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-400"
                  >
                    <Icon icon="lucide:link-2" size={14} className="text-fuchsia-300/70 transition group-hover:text-fuchsia-300" />
                    <span>{link.label}</span>
                    <Icon icon="lucide:external-link" size={14} className="text-white/40 transition group-hover:text-white/60" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-16 space-y-12">
          {hasBio && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="relative shrink-0">
                  <h2 className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-2xl font-bold tracking-tight text-fuchsia-300">
                    <Icon icon="lucide:user" className="h-8 w-8" />
                    About
                  </h2>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
              </div>

                <div className="relative px-4 py-2">
                {bioContent}
              </div>
            </section>
          )}

          <UserTripReportsSection
            displayName={profile.displayName}
            profileKey={profile.key}
            tripReports={tripReports}
            reportHrefPrefix={reportHrefPrefix}
          />

          <UserContributionsSection profileKey={profile.key} history={history} />
        </div>
      </div>
    </main>
  );
}
