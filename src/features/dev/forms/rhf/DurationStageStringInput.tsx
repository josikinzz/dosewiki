import { durationStageTransformer } from "@/data/schema";

import { TransformedRangeInput, type DurationStageFieldPath } from "./TransformedRangeInput";

const UNPARSEABLE_MESSAGE = "Not a duration range. Use a form like 15-30 minutes, or clear the field.";

export type DurationStageStringInputProps = {
  id?: string;
  name: DurationStageFieldPath;
  placeholder?: string;
  className?: string;
};

export function DurationStageStringInput({ placeholder = "e.g., 15-30 minutes", ...props }: DurationStageStringInputProps) {
  return (
    <TransformedRangeInput
      {...props}
      placeholder={placeholder}
      transformer={durationStageTransformer}
      unparseableMessage={UNPARSEABLE_MESSAGE}
    />
  );
}
