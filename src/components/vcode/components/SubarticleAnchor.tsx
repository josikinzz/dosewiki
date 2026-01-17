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
        <h3 className="text-lg font-semibold text-fuchsia-300 mt-6 mb-3">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}
