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
      className={`theme-card-surface rounded-2xl border p-6 shadow-2xl ring-1 backdrop-blur backdrop-safe transition hover:border-fuchsia-400/30 hover:shadow-[0_18px_50px_-12px_var(--theme-shadow-strong)] ${className}`.trim()}
    >
      {children}
    </motion.section>
  );
}
