import { Textarea } from "@/components/ui/textarea";
import { EditorField, EditorSection } from "@/features/dev/components";

import { MAX_BIO_LENGTH } from "./contributorsModel";

export type BioEditorProps = {
  bio: string;
  onBioChange: (value: string) => void;
  bioLength: number;
};

export function BioEditor({
  bio,
  onBioChange,
  bioLength,
}: BioEditorProps) {
  const isOverLimit = bioLength > MAX_BIO_LENGTH;

  return (
    <EditorSection icon="lucide:text" title="Bio">
      <EditorField
        id="profile-bio"
        label={<span className="sr-only">Bio</span>}
        counter={`${bioLength}/${MAX_BIO_LENGTH}`}
        error={isOverLimit ? `Bio must be ${MAX_BIO_LENGTH} characters or fewer.` : undefined}
        errorLive
      >
        {(fieldProps) => (
          <Textarea
            {...fieldProps}
            className="min-h-[180px] resize-y"
            value={bio}
            onChange={(event) => onBioChange(event.target.value)}
            placeholder="Share your research focus, experience, or collaboration interests."
            variant={isOverLimit ? "error" : "default"}
          />
        )}
      </EditorField>
    </EditorSection>
  );
}
