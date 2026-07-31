import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { classifyConvexRejection, convexRejectionResponse } from "./convexRejection";

/** How the Convex HTTP client rebuilds a thrown `ConvexError` on this side. */
function forwarded(data: unknown) {
  const error = new ConvexError("Server Error");
  (error as { data: unknown }).data = data;
  return error;
}

describe("classifyConvexRejection", () => {
  it("forwards a structured rejection with its code", () => {
    expect(
      classifyConvexRejection(
        forwarded({ code: "FIELD_CONFLICT", message: "The field moved." }),
      ),
    ).toEqual({ code: "FIELD_CONFLICT", message: "The field moved.", status: 409 });
  });

  it("maps a missing target to 404 and an unrecognized code to 400", () => {
    expect(
      classifyConvexRejection(forwarded({ code: "ARTICLE_NOT_FOUND", message: "Gone." }))?.status,
    ).toBe(404);
    expect(
      classifyConvexRejection(forwarded({ code: "SOMETHING_NEW", message: "Nope." })),
    ).toEqual({ code: "SOMETHING_NEW", message: "Nope.", status: 400 });
  });

  it("accepts a bare string payload under the default code", () => {
    expect(classifyConvexRejection(forwarded("Field is not inline-editable."))).toEqual({
      code: "CONVEX_REJECTED",
      message: "Field is not inline-editable.",
      status: 400,
    });
  });

  it("treats a non-conforming code as absent rather than passing it through", () => {
    expect(
      classifyConvexRejection(forwarded({ code: "not a code", message: "Nope." }))?.code,
    ).toBe("CONVEX_REJECTED");
  });

  it("declines errors that are not ConvexError", () => {
    expect(classifyConvexRejection(new Error("Could not find public function"))).toBeNull();
    expect(classifyConvexRejection(new TypeError("fetch failed"))).toBeNull();
    expect(classifyConvexRejection("just a string")).toBeNull();
    expect(classifyConvexRejection(null)).toBeNull();
  });

  it("declines a ConvexError carrying nothing renderable", () => {
    expect(classifyConvexRejection(forwarded({ code: "X_Y" }))).toBeNull();
    expect(classifyConvexRejection(forwarded({ message: "   " }))).toBeNull();
    expect(classifyConvexRejection(forwarded({ message: 42 }))).toBeNull();
    expect(classifyConvexRejection(forwarded(["a", "b"]))).toBeNull();
    expect(classifyConvexRejection(forwarded(17))).toBeNull();
    expect(classifyConvexRejection(forwarded(""))).toBeNull();
  });

  it("declines a payload long enough to be a leaked document rather than copy", () => {
    expect(classifyConvexRejection(forwarded({ message: "x".repeat(501) }))).toBeNull();
    expect(classifyConvexRejection(forwarded("x".repeat(501)))).toBeNull();
    expect(classifyConvexRejection(forwarded("x".repeat(500)))?.message).toHaveLength(500);
  });

  it("recognizes a ConvexError from a second copy of convex/values", () => {
    const crossRealm = Object.assign(new Error("Server Error"), {
      [Symbol.for("ConvexError")]: true,
      data: { code: "FIELD_CONFLICT", message: "The field moved." },
    });

    expect(classifyConvexRejection(crossRealm)?.status).toBe(409);
  });
});

describe("convexRejectionResponse", () => {
  it("renders the message and code at the mapped status", async () => {
    const response = convexRejectionResponse(
      forwarded({ code: "FIELD_CONFLICT", message: "Reload the article." }),
    );

    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({
      error: "Reload the article.",
      code: "FIELD_CONFLICT",
    });
  });

  it("returns null for anything that is not a deliberate rejection", () => {
    expect(convexRejectionResponse(new Error("boom"))).toBeNull();
  });
});
