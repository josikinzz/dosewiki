import { useState, memo } from "react";
import { Icon } from "../common/Icon";

interface SEIIntroSectionProps {
  effectCount: number;
  /** Optional tab-specific intro blob text */
  tabBlob?: string;
}

/**
 * Intro section for the Subjective Effect Index with expandable content.
 * 
 * Contains the main description paragraph always visible, with additional
 * context shown on toggle. Tab-specific intro blobs can be passed for
 * Sensory/Cognitive/Physical tabs.
 */
export const SEIIntroSection = memo(function SEIIntroSection({
  effectCount,
  tabBlob,
}: SEIIntroSectionProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="-mt-7 mb-10 text-center">
      {/* Tab-specific blob */}
      {tabBlob && (
        <p className="mb-4 text-base text-white/70 sm:text-lg">
          {tabBlob}
        </p>
      )}

      {/* Main intro paragraph */}
      <p className="text-base text-white/70 sm:text-lg">
        The <span className="font-semibold text-fuchsia-200">Subjective Effect Index</span> is 
        a comprehensive catalogue of {effectCount} subjective effects that may occur under the influence of 
        psychoactive substances.
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="ml-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80 align-middle"
          >
            <Icon icon="lucide:ellipsis" size={14} />
            <Icon icon="lucide:chevron-down" size={14} />
          </button>
        )}
      </p>

      {/* Expandable content */}
      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-base text-white/70 sm:text-lg">
            The effects are accompanied by detailed descriptions written in a consistent style 
            that avoids flowery metaphors, using simple and accessible language to serve as 
            a universal terminology for communicating experiences that are difficult to convey.
          </p>

          <p className="text-base text-white/70 sm:text-lg">
            Effects are organised into categories based on the senses they affect and their behavior, 
            with many broken down into leveling systems, subcomponents, and style variations. 
            Image, video, and audio replications supplement text-based descriptions.
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ml-2 inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80 align-middle"
            >
              <Icon icon="lucide:ellipsis" size={14} />
              <Icon icon="lucide:chevron-up" size={14} />
            </button>
          </p>
        </div>
      )}
    </div>
  );
});
