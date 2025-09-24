import { StickyNote } from "lucide-react";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";

interface NotesSectionProps {
  notes: string;
}

export function NotesSection({ notes }: NotesSectionProps) {
  return (
    <SectionCard delay={0.3}>
      <h2 className="flex items-center gap-3 text-xl font-semibold text-fuchsia-300">
        <IconBadge icon={StickyNote} label="Notes" />
        Notes
      </h2>
      <p className="mt-3 text-[0.95rem] leading-7 text-white/85">{notes}</p>
    </SectionCard>
  );
}
