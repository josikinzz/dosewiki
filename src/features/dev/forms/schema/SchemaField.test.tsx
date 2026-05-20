import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FieldMeta } from "@/data/schema";
import { SchemaField } from "./SchemaField";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

const objectMeta: FieldMeta = {
  path: "pharmacology.receptor_profile",
  label: "Receptor Profile",
  type: "object",
  required: false,
  default: {},
  section: "pharmacology",
};

const referenceMeta: FieldMeta = {
  path: "references",
  label: "Structured References",
  type: "reference",
  required: false,
  default: [],
  section: "citations",
};

describe("SchemaField", () => {
  it("uses the fallback Adapter for unknown field types", () => {
    const onChange = vi.fn();

    render(
      <SchemaField
        meta={{ ...objectMeta, type: "unknown" as FieldMeta["type"] }}
        value="current"
        onChange={onChange}
      />
    );

    fireEvent.change(screen.getByLabelText("Receptor Profile"), {
      target: { value: "next" },
    });

    expect(onChange).toHaveBeenCalledWith("next");
  });

  it("preserves invalid object JSON drafts without corrupting schema value", () => {
    const onChange = vi.fn();

    render(
      <SchemaField
        meta={objectMeta}
        value={{ existing: true }}
        onChange={onChange}
      />
    );

    const textarea = screen.getByLabelText("Receptor Profile");

    fireEvent.change(textarea, {
      target: { value: "{" },
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("{");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByText("Invalid JSON. Fix the draft before saving this field.")
    ).toBeInTheDocument();

    fireEvent.change(textarea, {
      target: { value: "{\"existing\":false}" },
    });

    expect(onChange).toHaveBeenCalledWith({ existing: false });
  });

  it("keeps structured reference arrays object-shaped instead of stringifying them", () => {
    const onChange = vi.fn();

    render(
      <SchemaField
        meta={referenceMeta}
        value={[{ id: "ref-a", type: "webpage", title: "Reference A", authors: [], sourceType: "unknown", quality: "fallback" }]}
        onChange={onChange}
      />
    );

    expect(screen.getByDisplayValue("ref-a")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Reference A")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("[object Object]")).not.toBeInTheDocument();
  });
});
