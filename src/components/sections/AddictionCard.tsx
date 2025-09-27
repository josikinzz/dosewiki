import { Repeat2 } from 'lucide-react';
import { SectionCard } from '../common/SectionCard';
import { IconBadge } from '../common/IconBadge';

interface AddictionCardProps {
  summary: string;
}

export function AddictionCard({ summary }: AddictionCardProps) {
  return (
    <SectionCard delay={0.1}>
      <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={Repeat2} label="Addiction potential" />
        Addiction Potential
      </h2>
      <p className="mt-3 text-[0.95rem] leading-7 text-white/85">{summary}</p>
    </SectionCard>
  );
}

