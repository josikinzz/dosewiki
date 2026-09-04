import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One row, two layouts. Above `md` the elements lay out as a real table; below
 * it every row becomes a two-column card and each labelled cell shows its
 * column name inline. The switch is CSS only, so a row has one DOM node, one
 * set of handlers, and one source of data in both layouts.
 *
 * `display: block` on a table strips its semantics in Chrome and Safari, so
 * the table, row, and column-header roles are set explicitly and survive the
 * mobile layout. The header row is hidden below `md`; the per-cell labels
 * carry the column names there instead.
 */

const HEADER_CELL_CLASS =
  "theme-text-faint px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em]";

export type EditorTableProps = {
  children: ReactNode;
  /** Applied to the `<table>`, e.g. `md:min-w-[56rem]` for the desktop layout. */
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
  /** Column name shown above the value in the card layout only. */
  label?: string;
  /** Spans both card columns; no effect in the table layout. */
  wide?: boolean;
};

export function EditorTableCell({ label, wide = false, className, children, ...rest }: EditorTableCellProps) {
  return (
    <td
      className={cn("block min-w-0 md:table-cell md:px-3 md:py-2.5", wide && "col-span-2", className)}
      {...rest}
    >
      {label ? (
        <span className="theme-text-faint mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] md:hidden">
          {label}
        </span>
      ) : null}
      {children}
    </td>
  );
}
