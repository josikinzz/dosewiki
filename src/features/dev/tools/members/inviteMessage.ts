import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
import { getRoleDisplayName, roleMeetsFloor } from "@/lib/auth/roles";
import { formatLocaleNames } from "./membersModel";
import type { InviteCodeSummary } from "./inviteCodeRequests";

type InviteMessageInput = {
  invite: Pick<InviteCodeSummary, "role" | "glossaryLocales" | "expiresAt" | "maxUses">;
  code: string;
  url: string;
};

function formatInviteExpiry(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function composeInviteMessage({ invite, code, url }: InviteMessageInput): string {
  const role = getRoleDisplayName(invite.role);
  const uses = invite.maxUses === 1 ? "once" : `${invite.maxUses} times`;
  const lines = [
    `You're invited to dose.wiki as ${role}. ${ROLE_DESCRIPTIONS[invite.role].summary}`,
  ];
  if (roleMeetsFloor(invite.role, "translator")) {
    lines.push(`Approved glossary languages: ${formatLocaleNames(invite.glossaryLocales ?? [])}.`);
  }
  lines.push(
    "",
    `First step: open ${url} and choose a username and password. You are signed in as soon as the account is created.`,
    `If the link does not fill in the code, enter it by hand: ${code}`,
    "",
    `The invite expires on ${formatInviteExpiry(invite.expiresAt)} and works ${uses}.`,
  );
  return lines.join("\n");
}
