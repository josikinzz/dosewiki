import { describe, expect, it } from "vitest";

import { composeInviteMessage } from "./inviteMessage";

const URL = "https://dev.dose.wiki/invite?code=abcd";

describe("composeInviteMessage", () => {
  it("names the role, the first step, the code and the expiry", () => {
    const message = composeInviteMessage({
      invite: { role: "editor", expiresAt: "2026-09-08T00:00:00.000Z", maxUses: 1 },
      code: "abcd",
      url: URL,
    });
    expect(message).toContain("You're invited to dose.wiki as Editor.");
    expect(message).toContain(`First step: open ${URL} and choose a username and password.`);
    expect(message).toContain("enter it by hand: abcd");
    expect(message).toContain("The invite expires on September 8, 2026 and works once.");
    expect(message).not.toContain("glossary languages");
  });

  it("lists a translator's languages by name and counts several uses", () => {
    const message = composeInviteMessage({
      invite: { role: "translator", glossaryLocales: ["nl", "ru"], expiresAt: "2026-09-08T00:00:00.000Z", maxUses: 3 },
      code: "abcd",
      url: URL,
    });
    expect(message).toContain("Approved glossary languages: Dutch, Russian.");
    expect(message).toContain("works 3 times.");
  });
});
