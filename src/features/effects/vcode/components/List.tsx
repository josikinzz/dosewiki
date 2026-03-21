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
    ? "list-decimal list-inside space-y-2 marker:text-fuchsia-300"
    : "list-disc list-inside space-y-2 marker:text-fuchsia-300";

  return (
    <Component className={`${listClass} type-supporting-copy my-4 pl-2 text-white/80`}>
      {children}
    </Component>
  );
}

/**
 * List item.
 */
export function ListItem({ children }: PropsWithChildren) {
  return (
    <li className="leading-[1.72]">
      {children}
    </li>
  );
}
