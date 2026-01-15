import { memo, type ReactNode } from "react";
import { Icon as IconComponent, type IconName } from "../common/Icon";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  icon?: IconName;
}

export const PageHeader = memo(function PageHeader({ title, description, icon }: PageHeaderProps) {
  return (
    <header className="mb-10 flex flex-col gap-3 text-center">
      <h1 className="font-display flex items-center justify-center gap-3 text-[2.25rem] font-bold tracking-tight text-fuchsia-300 sm:text-[2.7rem]">
        {icon ? <IconComponent icon={icon} size={32} className="text-current" /> : null}
        <span>{title}</span>
      </h1>
      {description && <p className="text-base text-white/70 sm:text-lg">{description}</p>}
    </header>
  );
});
