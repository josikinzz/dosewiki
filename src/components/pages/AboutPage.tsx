import { memo } from "react";
import { Info } from "lucide-react";
import { PageHeader } from "../sections/PageHeader";
import { SectionCard } from "../common/SectionCard";
import {
  dosageCategoryGroups,
  effectSummaries,
  substanceRecords,
} from "../../data/library";

const linkClass = "cursor-pointer text-fuchsia-200 transition hover:text-fuchsia-100";
const githubUrl = "https://github.com/josikinzz/dosewiki";
const articlesDownloadUrl =
  "https://raw.githubusercontent.com/josikinzz/dosewiki/main/src/data/articles.json";

export const AboutPage = memo(function AboutPage() {
  const compoundCount = substanceRecords.length;
  const categoryCount = dosageCategoryGroups.length;
  const effectCount = effectSummaries.length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-10 md:max-w-4xl">
      <PageHeader
        title="About dose.wiki"
        icon={Info}
        description="Structured psychoactive data for quick reference and research workflows."
      />
      <div className="space-y-6 md:space-y-8">
        <SectionCard>
          <p className="text-sm text-white/75 md:text-base">
            Dose.Wiki is maintained on
            {" "}
            <a href={githubUrl} className={linkClass} target="_blank" rel="noreferrer">
              GitHub
            </a>
            {" "}
            and curates {compoundCount} published substances with normalized dosage, duration,
            effect, and interaction metadata. The original dataset is sourced from
            {" "}
            <a href="https://rc.community" className={linkClass} target="_blank" rel="noreferrer">
              rc.community
            </a>
            .
          </p>
          <ul className="mt-6 list-disc space-y-3 pl-5 text-sm text-white/75 marker:text-white/60 md:pl-6 md:text-base">
            <li>
              Browse the {" "}
              <a href="#/substances" className={linkClass}>
                Substance Index
              </a>{" "}
              to pivot across 13 psychoactive and chemical groupings and open full profiles.
            </li>
            <li>
              Inspect reported outcomes inside the {" "}
              <a href="#/effects" className={linkClass}>
                Subjective Effects
              </a>{" "}
              catalog covering 2003 tracked phenomena.
            </li>
            <li>
              Review combination guidance on the {" "}
              <a href="#/interactions" className={linkClass}>
                Interactions
              </a>{" "}
              hub as risk annotations continue to expand.
            </li>
            <li>
              Audit edits or draft new entries in the {" "}
              <a href="#/dev/edit" className={linkClass}>
                Dev Tools
              </a>{" "}
              workspace, which mirrors the live JSON schema.
            </li>
          </ul>
          <p className="mt-6 text-sm text-white/60 md:text-base">
            Every surface reads from the
            {" "}
            <a href={articlesDownloadUrl} className={linkClass} download>
              articles dataset
            </a>
            . Use the global search in the header to jump straight to any record or open a mechanism
            detail via the badges on each substance.
          </p>
        </SectionCard>
      </div>
    </div>
  );
});
