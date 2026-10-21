import { doseRangeTransformer } from "@/data/schema";

import { TransformedRangeInput, type DoseRangeFieldPath } from "./TransformedRangeInput";

const UNPARSEABLE_MESSAGE =
  "Not a dose range. Use a form like 10-20 mg, 10+ mg, ~10 mg, or <20 mg, or clear the field.";

export type DoseRangeStringInputProps = {
  id?: string;
  name: DoseRangeFieldPath;
  placeholder?: string;
  className?: string;
};

export function DoseRangeStringInput({ placeholder = "e.g., 10-20 mg", ...props }: DoseRangeStringInputProps) {
  return (
    <TransformedRangeInput
      {...props}
      placeholder={placeholder}
      transformer={doseRangeTransformer}
      unparseableMessage={UNPARSEABLE_MESSAGE}
    />
  );
}
