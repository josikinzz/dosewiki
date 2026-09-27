import { useId } from "react";

import { Textarea } from "@/components/ui/textarea";
import { EditorField } from "@/features/dev/components";

import { MAX_BIO_LENGTH } from "./contributorsModel";

export type BioEditorProps = {
  bio: string;
  onBioChange: (value: string) => void;
  bioLength: number;
  headingLevel?: "h3" | "h4" | "h5";
  headingClassName?: string;
  placeholder?: string;
};

export function BioEditor({
  bio,
  onBioChange,
  bioLength,
  headingLevel: Heading = "h4",
  headingClassName,
  placeholder = "Research focus, experience, or what to collaborate on.",
}: BioEditorProps) {
  const id = useId();
  const isOverLimit = bioLength > MAX_BIO_LENGTH;

  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <Heading id={`${id}-heading`} className={headingClassName}>
        Bio
      </Heading>
      <EditorField
        id="profile-bio"
        label={<span className="sr-only">Bio</span>}
        description="Markdown. Left empty, the public page writes a short line of its own."
        counter={`${bioLength.toLocaleString()} of ${MAX_BIO_LENGTH.toLocaleString()}`}
        error={isOverLimit ? `The bio is ${(bioLength - MAX_BIO_LENGTH).toLocaleString()} characters over the limit.` : undefined}
        errorLive
      >
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            className="min-h-[180px] resize-y text-[16px] md:text-sm"
            value={bio}
            onChange={(event) => onBioChange(event.target.value)}
            placeholder={placeholder}
            variant={isOverLimit ? "error" : "default"}
          />
        )}
      </EditorField>
    </section>
  );
}
