import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { MAX_BIO_LENGTH } from "./types";
import type { BioEditorProps } from "./types";

export function BioEditor({
  bio,
  onBioChange,
  bioLength,
}: BioEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="profile-bio">
          Bio
        </Label>
        <span className={`text-xs ${bioLength > MAX_BIO_LENGTH ? "text-rose-300" : "text-white/45"}`}>
          {bioLength}/{MAX_BIO_LENGTH}
        </span>
      </div>
      <Textarea
        id="profile-bio"
        className="min-h-[180px] resize-y"
        value={bio}
        onChange={(event) => onBioChange(event.target.value)}
        placeholder="Share your research focus, experience, or collaboration interests."
      />
    </div>
  );
}
