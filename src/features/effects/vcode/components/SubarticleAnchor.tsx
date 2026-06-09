import { PropsWithChildren } from "react";

interface SubarticleAnchorProps {
  id?: string;
  title?: string;
}

/**
 * Anchor target for table of contents navigation.
 * 
 * Creates an anchor point with a heading for the subarticle section.
 */
export function SubarticleAnchor({ 
  id, 
  title, 
  children,
}: PropsWithChildren<SubarticleAnchorProps>) {
  return (
    <section id={id} className="scroll-mt-20">
      {title && (
        <h3 className="theme-accent-heading mb-3 mt-6 text-lg font-semibold">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}
