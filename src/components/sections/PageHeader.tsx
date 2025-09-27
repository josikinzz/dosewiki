import { memo, type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
}

export const PageHeader = memo(function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="mb-10 flex flex-col gap-3 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-fuchsia-300 sm:text-4xl">{title}</h1>
      {description && <p className="text-base text-white/70 sm:text-lg">{description}</p>}
    </header>
  );
});
