import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

const HEADER_CELL_CLASS =
  "type-meta-label theme-text-faint px-3 py-2";

export type EditorTableProps = {
  children: ReactNode;
  className?: string;
};

export function EditorTable({ children, className }: EditorTableProps) {
  return (
    <div className="rounded-xl border border-dose-border md:overflow-x-auto">
      <table role="table" className={cn("block w-full border-collapse text-left md:table", className)}>
        {children}
      </table>
    </div>
  );
}

export function EditorTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="hidden md:table-header-group">
      <tr role="row" className="border-b border-dose-border">
        {children}
      </tr>
    </thead>
  );
}

export function EditorTableHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th role="columnheader" scope="col" className={cn(HEADER_CELL_CLASS, className)}>
      {children}
    </th>
  );
}

export function EditorTableBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="block md:table-row-group">
      {children}
    </tbody>
  );
}

export type EditorTableRowProps = ComponentPropsWithoutRef<"tr">;

export function EditorTableRow({ className, children, ...rest }: EditorTableRowProps) {
  return (
    <tr
      role="row"
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-3 border-b border-dose-border p-4 last:border-0 md:table-row md:p-0",
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export type EditorTableCellProps = ComponentPropsWithoutRef<"td"> & {
  label?: string;
  wide?: boolean;
};

export function EditorTableCell({ label, wide = false, className, children, ...rest }: EditorTableCellProps) {
  return (
    <td
      className={cn("block min-w-0 md:table-cell md:px-3 md:py-2.5", wide && "col-span-2", className)}
      {...rest}
    >
      {label ? (
        <span className="type-meta-label theme-text-faint mb-1 block md:hidden">
          {label}
        </span>
      ) : null}
      {children}
    </td>
  );
}
