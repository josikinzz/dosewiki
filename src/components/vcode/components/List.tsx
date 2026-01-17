import { PropsWithChildren } from "react";

interface ListProps {
  ordered?: boolean;
}

/**
 * Ordered or unordered list.
 */
export function List({ ordered = false, children }: PropsWithChildren<ListProps>) {
  const Component = ordered ? "ol" : "ul";
  const listClass = ordered
    ? "list-decimal list-inside space-y-1 marker:text-fuchsia-300"
    : "list-disc list-inside space-y-1 marker:text-fuchsia-300";

  return (
    <Component className={`${listClass} text-sm text-white/80 my-3 pl-2`}>
      {children}
    </Component>
  );
}

/**
 * List item.
 */
export function ListItem({ children }: PropsWithChildren) {
  return (
    <li className="leading-relaxed">
      {children}
    </li>
  );
}
