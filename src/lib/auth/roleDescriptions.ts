import type { AppRole } from "./roles";

/**
 * The plain-language contract for each role. Rendered wherever an admin picks
 * a role (Members tab, invite minting) and on the invite page, so a person
 * reads the same words whether they are granting the role or receiving it.
 * The enforcement lives in `convex/lib/auth.ts` (`requireRole` floors); if a
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
      "Approve, reject, and revert proposals in the queue.",
      "Mint invites, change roles, ban accounts, issue password resets.",
      "Edit banners, molecules, replications, and anyone's profile, playlists, or reports.",
      "See every prior version of a profile, playlist, or report, and restore a removed playlist.",
    ],
    cannot: ["Demote or ban themselves."],
  },
  editor: {
    role: "editor",
    summary:
      "Writes. Every edit lands in the review queue as a proposal, and nothing reaches the site until an admin approves it.",
    can: [
      "Open the article, tag, index layout, copy, and About editors and draft changes in them.",
      "Submit each change as a proposal, comment on proposals, and revise their own after review.",
      "See the whole review queue.",
      "Edit their own profile, playlists, and trip reports.",
    ],
    cannot: [
      "Publish anything directly.",
      "Approve a proposal, including their own.",
      "Delete anything. A playlist they own can be removed from view, and an admin can bring it back.",
      "See the member list or mint invites.",
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
  ROLE_DESCRIPTIONS.contributor,
];
