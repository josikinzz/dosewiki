import { PostgresError } from "@server/postgres/runtime/values";
import { describe, expect, it } from "vitest";

import { classifyDataRejection, dataRejectionResponse } from "./dataRejection";

function forwarded(data: unknown) {
  return new PostgresError(data);
}

describe("classifyDataRejection", () => {
  it("forwards a structured rejection with its code", () => {
    expect(
      classifyDataRejection(
        forwarded({ code: "FIELD_CONFLICT", message: "The field moved." }),
      ),
    ).toEqual({ code: "FIELD_CONFLICT", message: "The field moved.", status: 409 });
  });

  it("maps a missing target to 404 and an unrecognized code to 400", () => {
    expect(
      classifyDataRejection(forwarded({ code: "ARTICLE_NOT_FOUND", message: "Gone." }))?.status,
    ).toBe(404);
    expect(
      classifyDataRejection(forwarded({ code: "SOMETHING_NEW", message: "Nope." })),
    ).toEqual({ code: "SOMETHING_NEW", message: "Nope.", status: 400 });
  });

  it("accepts a bare string payload under the default code", () => {
    expect(classifyDataRejection(forwarded("Field is not inline-editable."))).toEqual({
      code: "DATA_REJECTED",
      message: "Field is not inline-editable.",
      status: 400,
    });
  });

  it("treats a non-conforming code as absent rather than passing it through", () => {
    expect(
      classifyDataRejection(forwarded({ code: "not a code", message: "Nope." }))?.code,
    ).toBe("DATA_REJECTED");
  });

  it("declines errors that are not deliberate write rejections", () => {
    expect(classifyDataRejection(new Error("Could not find public function"))).toBeNull();
    expect(classifyDataRejection(new TypeError("fetch failed"))).toBeNull();
    expect(classifyDataRejection("just a string")).toBeNull();
    expect(classifyDataRejection(null)).toBeNull();
  });

  it("declines a rejection carrying nothing renderable", () => {
    expect(classifyDataRejection(forwarded({ code: "X_Y" }))).toBeNull();
    expect(classifyDataRejection(forwarded({ message: "   " }))).toBeNull();
    expect(classifyDataRejection(forwarded({ message: 42 }))).toBeNull();
    expect(classifyDataRejection(forwarded(["a", "b"]))).toBeNull();
    expect(classifyDataRejection(forwarded(17))).toBeNull();
    expect(classifyDataRejection(forwarded(""))).toBeNull();
  });

  it("declines a payload long enough to be a leaked document rather than copy", () => {
    expect(classifyDataRejection(forwarded({ message: "x".repeat(501) }))).toBeNull();
    expect(classifyDataRejection(forwarded("x".repeat(501)))).toBeNull();
    expect(classifyDataRejection(forwarded("x".repeat(500)))?.message).toHaveLength(500);
  });

  it("recognizes a deliberate rejection from another server bundle", () => {
    const crossRealm = Object.assign(new Error("Server Error"), {
      [Symbol.for("dosewiki.PostgresError")]: true,
      data: { code: "FIELD_CONFLICT", message: "The field moved." },
    });

    expect(classifyDataRejection(crossRealm)?.status).toBe(409);
  });
});

describe("dataRejectionResponse", () => {
  it("renders the message and code at the mapped status", async () => {
    const response = dataRejectionResponse(
      forwarded({ code: "FIELD_CONFLICT", message: "Reload the article." }),
    );

    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({
      error: "Reload the article.",
      code: "FIELD_CONFLICT",
    });
  });

  it("returns null for anything that is not a deliberate rejection", () => {
    expect(dataRejectionResponse(new Error("boom"))).toBeNull();
  });
});
