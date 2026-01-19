import { PropsWithChildren, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cardAnimation } from "../../constants/motion";

interface SectionCardProps {
  delay?: number;
  className?: string;
}

export function SectionCard({ children, delay = 0, className = "" }: PropsWithChildren<SectionCardProps>) {
  const prefersReducedMotion = useReducedMotion();

  const animationProps = useMemo(() => {
    if (prefersReducedMotion) {
      return {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
      };
    }

    return cardAnimation;
  }, [prefersReducedMotion]);

  const transition = prefersReducedMotion ? undefined : { ...cardAnimation.transition, delay };

  return (
    <motion.section
      {...animationProps}
      transition={transition}
      className={`rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 ring-1 ring-white/5 backdrop-blur backdrop-safe transition hover:border-fuchsia-400/30 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)] ${className}`.trim()}
    >
      {children}
    </motion.section>
  );
}
