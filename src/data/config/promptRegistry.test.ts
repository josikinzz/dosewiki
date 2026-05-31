import { describe, expect, it } from "vitest";

import { getCatalogSectionPromptDescriptors } from "@/schema/substance/sectionManifest";
import { sectionPromptDescriptors } from "./promptRegistry";

describe("prompt registry section catalog integration", () => {
  it("derives article section prompt descriptors from the canonical section catalog", () => {
    const descriptorsBySectionKey = new Map(
      sectionPromptDescriptors
        .filter((descriptor) => descriptor.sectionKey !== "base")
        .map((descriptor) => [descriptor.sectionKey, descriptor]),
    );

    expect(Object.fromEntries(descriptorsBySectionKey)).toEqual(
      Object.fromEntries(
        getCatalogSectionPromptDescriptors().map((descriptor) => [
          descriptor.sectionKey,
          descriptor,
        ]),
      ),
    );
  });
});
