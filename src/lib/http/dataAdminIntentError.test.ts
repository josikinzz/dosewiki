import { describe, expect, it, vi } from "vitest";
import { diagnoseDataAdminCredential } from "./dataAdminIntentError";

describe("diagnoseDataAdminCredential", () => {
  it("blames the credential when the deployment also refuses the probe", async () => {
    const message = await diagnoseDataAdminCredential({
      intent: "replicationMaintenance",
      probe: () => Promise.reject(new Error("[Request ID: abc] Server Error")),
    });

    expect(message).toContain("replicationMaintenance");
  });

  it("leaves a genuine failure its own error when the credential works", async () => {
    const probe = vi.fn(() => Promise.resolve({ ok: true }));

    expect(
      await diagnoseDataAdminCredential({ intent: "replicationMaintenance", probe }),
    ).toBeNull();
    expect(probe).toHaveBeenCalledOnce();
  });
});
