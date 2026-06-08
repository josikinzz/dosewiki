import { useState, memo } from "react";
import { ExpandButton } from "@/components/common/ExpandButton";

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
        <p className="mb-4 text-base leading-8 text-white/74 sm:text-lg">
          {tabBlob}
        </p>
      )}

      {/* Main intro paragraph */}
      <p className="text-base leading-8 text-white/78 sm:text-lg">
        The <span className="font-semibold text-fuchsia-200">Subjective Effect Index</span> is 
        a comprehensive catalogue of {effectCount} subjective effects that may occur under the influence of 
        psychoactive substances.
        {!expanded && (
          <span className="ml-2 inline-flex align-middle">
            <ExpandButton
              isExpanded={false}
              onToggle={() => setExpanded(true)}
              variant="floating"
              ariaLabel="Expand Subjective Effect Index introduction"
            />
          </span>
        )}
      </p>

      {/* Expandable content */}
      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-base leading-8 text-white/74 sm:text-lg">
            The effects are accompanied by detailed descriptions written in a consistent style 
            that avoids flowery metaphors, using simple and accessible language to serve as 
            a universal terminology for communicating experiences that are difficult to convey.
          </p>

          <p className="text-base leading-8 text-white/74 sm:text-lg">
            Effects are organised into categories based on the senses they affect and their behavior, 
            with many broken down into leveling systems, subcomponents, and style variations. 
            Image, video, and audio replications supplement text-based descriptions.
            <span className="ml-2 inline-flex align-middle">
              <ExpandButton
                isExpanded={true}
                onToggle={() => setExpanded(false)}
                variant="floating"
                ariaLabel="Collapse Subjective Effect Index introduction"
              />
            </span>
          </p>
        </div>
      )}
    </div>
  );
});
