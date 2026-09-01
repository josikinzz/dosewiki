import assert from "node:assert/strict";
import test from "node:test";
import { deriveIdentityTokenPayload } from "./materialize-profile-tokens.mjs";

test("identity token payload uses only exact key, display name, and reviewed aliases", () => {
  const tokens = deriveIdentityTokenPayload([
    { profileId: "p1", key: "ARTIST", displayName: "Artist Name", aliases: ["Old Handle"], links: [{ label: "Example", url: "https://example.test/not-an-identity-token" }] },
    { profileId: "p2", key: "SECOND", displayName: "Second", aliases: ["artist name"] },
  ]);
  assert.deepEqual(tokens, [
    { normalized_token: "artist", owner_profile_ids: ["p1"] },
    { normalized_token: "artist name", owner_profile_ids: ["p1", "p2"] },
    { normalized_token: "old handle", owner_profile_ids: ["p1"] },
    { normalized_token: "second", owner_profile_ids: ["p2"] },
  ]);
  assert.equal(tokens.some((token) => token.normalized_token.includes("example.test")), false);
});
