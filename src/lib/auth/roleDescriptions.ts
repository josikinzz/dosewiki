import type { AppRole } from "./roles";

/**
 * The plain-language contract for each role. Rendered wherever an admin picks
 * a role (Members tab, invite minting) and on the invite page, so a person
 * reads the same words whether they are granting the role or receiving it.
 * The enforcement lives in `server/lib/auth.ts` (`requireRole` floors); if a
 * floor moves, move the sentence here too.
 */
export type RoleDescription = {
  role: AppRole;
  summary: string;
  can: readonly string[];
  cannot: readonly string[];
};

export const ROLE_DESCRIPTIONS: Record<AppRole, RoleDescription> = {
  admin: {
    role: "admin",
    summary: "Runs the site. Publishes directly and decides what everyone else's changes become.",
    can: [
      "Publish any change straight to production, no review.",
      "Approve other editors' proposals, reject submissions, and revert eligible published changes.",
      "Mint invites, change roles, ban accounts, issue password resets.",
      "Edit banners, molecules, replications, and anyone's profile, playlists, or reports.",
      "See every prior version of a profile, playlist, or report, and restore a removed playlist.",
    ],
    cannot: ["Demote or ban themselves.", "Approve their own proposals."],
  },
  editor_translator: {
    role: "editor_translator",
    summary: "Has both Editor and Translator permissions, with translation work limited to approved glossary languages.",
    can: ["Draft article and site-copy changes for admin review.", "Review, edit, import, and export glossary renderings in approved languages.", "Edit their own profile, playlists, and trip reports."],
    cannot: ["Publish article proposals directly.", "Manage members.", "Edit unapproved glossary languages.", "Start or queue translations."],
  },
  editor: {
    role: "editor",
    summary:
      "Drafts article and site-copy changes for admin review. Submitting a proposal does not publish it.",
    can: [
      "Open the article, tag, index layout, copy, and About editors and draft changes in them.",
      "Track their own submissions, read review feedback, comment, and submit revisions.",
      "Edit their own profile, playlists, and trip reports.",
    ],
    cannot: [
      "Publish article or site-copy proposals directly.",
      "Approve a proposal, including their own.",
      "Delete anything. A playlist they own can be removed from view, and an admin can bring it back.",
      "See the member list or mint invites.",
      "Open the global change review queue or read another editor's submissions.",
      "Edit translated glossary renderings without a separately assigned Translator role and approved languages.",
    ],
  },
  translator: {
    role: "translator",
    summary: "Reviews how the site's terms are written in a language. Renders the taxonomy, never changes it.",
    can: [
      "Approve and edit glossary renderings only in languages an admin has approved.",
      "Export and import glossary sheets for those approved languages.",
      "Edit their own profile.",
      "Build and rearrange their own replication playlists.",
      "Edit their own trip reports.",
    ],
    cannot: [
      "Start or queue translations. That spends money.",
      "Open the article tools or the review queue.",
      "Change anything someone else owns.",
    ],
  },
  contributor: {
    role: "contributor",
    summary: "Owns their own things on the site and nothing else.",
    can: ["Edit their own profile.", "Build and rearrange their own replication playlists.", "Edit their own trip reports."],
    cannot: [
      "Open the article tools or the review queue.",
      "Change anything someone else owns.",
      "Delete anything. A playlist they own can be removed from view, and an admin can bring it back.",
    ],
  },
  viewer: {
    role: "viewer",
    summary: "A leftover from before invites. Signs in and sees nothing until an admin picks a real role.",
    can: [],
    cannot: ["Open the editor at all."],
  },
};

/** The roles an invite can grant, in the order the pickers list them. */
export const INVITABLE_ROLE_DESCRIPTIONS: readonly RoleDescription[] = [
  ROLE_DESCRIPTIONS.editor,
  ROLE_DESCRIPTIONS.translator,
  ROLE_DESCRIPTIONS.editor_translator,
  ROLE_DESCRIPTIONS.contributor,
];
