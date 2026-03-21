import { IconBadge } from "@/components/common/IconBadge";

interface AddictionCardProps {
  summary: string;
}

export function AddictionCard({ summary }: AddictionCardProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="theme-section-header-glow pointer-events-none absolute -inset-x-4 -inset-y-3 rounded-full blur-xl" />
          <h2 className="relative flex shrink-0 items-center gap-3 text-xl font-bold tracking-tight text-fuchsia-300">
            <IconBadge icon="lucide:repeat-2" />
            Addiction Potential
          </h2>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-fuchsia-500/30 via-fuchsia-500/10 to-transparent" />
      </div>
      <p className="text-[0.95rem] leading-7 text-white/85">{summary}</p>
    </div>
  );
}

