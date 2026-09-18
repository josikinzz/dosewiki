import type { ReactNode } from "react";
import type { MessageValues } from "@/i18n/messages";
import { EditableValue } from "../../../editing";

interface EditableHarmTextProps {
  path: string;
  value: string;
  label: string;
  labelValues?: MessageValues;
  editable: boolean;
  as?: "span" | "div";
  className?: string;
  children: ReactNode;
}

export function EditableHarmText({
  path,
  value,
  label,
  labelValues,
  editable,
  as = "div",
  className,
  children,
}: EditableHarmTextProps) {
  if (!editable) return <>{children}</>;
  return (
    <EditableValue
      as={as}
      className={className}
      label={label}
      labelValues={labelValues}
      path={path}
      value={value}
    >
      {children}
    </EditableValue>
  );
}
