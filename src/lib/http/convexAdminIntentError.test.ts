import { describe, expect, it, vi } from "vitest";
import { diagnoseConvexAdminCredential } from "./convexAdminIntentError";

describe("diagnoseConvexAdminCredential", () => {
  /**
   * Convex sends the caller `Error: [Request ID: …] Server Error` for both a
   * rejected token and a real bug, so the verdict has to come from the probe,
   * not the message.
   */
  it("blames the credential when the deployment also refuses the probe", async () => {
    const message = await diagnoseConvexAdminCredential({
      intent: "replicationMaintenance",
      probe: () => Promise.reject(new Error("[Request ID: abc] Server Error")),
    });

    expect(message).toContain("replicationMaintenance");
    expect(message).toContain("convex:doctor");
  });

  it("leaves a genuine failure its own error when the credential works", async () => {
    const probe = vi.fn(() => Promise.resolve({ ok: true }));

    expect(
      await diagnoseConvexAdminCredential({ intent: "replicationMaintenance", probe }),
    ).toBeNull();
    expect(probe).toHaveBeenCalledOnce();
  });
});
