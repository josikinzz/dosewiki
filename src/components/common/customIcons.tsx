import type { SVGProps } from "react";

type CustomIconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

export const customIcons: Record<string, CustomIconComponent> = {
  benzene: (props) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="22,12 17,20.5 7,20.5 2,12 7,3.5 17,3.5" />
      <line x1="16.5" y1="12" x2="14.5" y2="15.5" />
      <line x1="9.5" y1="15.5" x2="7.5" y2="12" />
      <line x1="9.5" y1="8" x2="14.5" y2="8" />
    </svg>
  ),
};
