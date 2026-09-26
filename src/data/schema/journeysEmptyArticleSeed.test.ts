import { describe, expect, it } from "vitest";

import emptyArticleSeed from "../../../scripts/tools/journeys/emptyArticleSeed.json";
import { createEmptyArticle } from "./defaults.generated";

/**
 * The browser journeys and screenshots answer thin library rows as whole
 * articles over this seed, so article previews draw. The fixtures are plain
 * Node modules and cannot import the generated TypeScript default, so they
 * keep a JSON copy; this keeps it in step with the schema.
 */
describe("journeys empty article seed", () => {
  it("matches createEmptyArticle() (rerun the copy after npm run generate:schema)", () => {
    expect(emptyArticleSeed).toEqual(JSON.parse(JSON.stringify(createEmptyArticle())));
  });
});
