import { memo, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
}

export const PageHeader = memo(function PageHeader({ title, description, icon: Icon }: PageHeaderProps) {
  return (
    <header className="mb-10 flex flex-col gap-3 text-center">
      <h1 className="flex items-center justify-center gap-3 text-3xl font-bold tracking-tight text-fuchsia-300 sm:text-4xl">
        {Icon ? <Icon className="h-8 w-8 text-current" aria-hidden="true" focusable="false" /> : null}
        <span>{title}</span>
      </h1>
      {description && <p className="text-base text-white/70 sm:text-lg">{description}</p>}
    </header>
  );
});
