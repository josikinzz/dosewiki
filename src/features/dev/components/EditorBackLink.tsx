import Link from "next/link";
import { Icon } from "@/components/common/Icon";
import { cn } from "@/lib/utils";

export function EditorBackLink({ className }: { className?: string }) {
  return (
    <Link href="/dev" className={cn("theme-back-link inline-flex min-h-8 items-center gap-1.5 text-sm font-medium [@media(pointer:coarse)]:min-h-11", className)}>
      <Icon icon="lucide:arrow-left" size={15} className="shrink-0" />
      Back to the editor
    </Link>
  );
}
