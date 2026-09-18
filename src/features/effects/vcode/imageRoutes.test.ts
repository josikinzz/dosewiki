import { describe, expect, it } from "vitest";

import { selectImageRoute } from "./imageRoutes";

const ROUTES =
  "psychedelic:https://cdn.test/api/storage/aaa:Namaste:Luke Brown:A psychedelic entity." +
  ",deliriant:https://cdn.test/api/storage/bbb:HatMan:Sverrirorz:A deliriant entity.";

describe("per-drug-class image variants", () => {
  it("selects the variant the surface's drug class names", () => {
    // The packed URL carries its own colons, so the fields cannot be split
    // naively: a wrong split silently truncates the media URL.
    expect(selectImageRoute(ROUTES, "deliriant")).toEqual({
      src: "https://cdn.test/api/storage/bbb",
      title: "HatMan",
      artist: "Sverrirorz",
      caption: "A deliriant entity.",
    });
  });

  it("leaves the embed's own media in place where no variant applies", () => {
    // No class (an ordinary effect article), an unlisted class, and a
    // malformed payload all mean "render what the embed already carries".
    expect(selectImageRoute(ROUTES, undefined)).toBeNull();
    expect(selectImageRoute(ROUTES, "dissociative")).toBeNull();
    expect(selectImageRoute("deliriant-without-a-url", "deliriant")).toBeNull();
    expect(selectImageRoute(undefined, "deliriant")).toBeNull();
  });
});
