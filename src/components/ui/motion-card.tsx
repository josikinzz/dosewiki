import { PropsWithChildren, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cardAnimation } from "@/constants/motion";
import { cn } from "@/lib/utils";

export interface MotionCardProps {
  delay?: number;
  className?: string;
  variant?: "default" | "accent" | "danger";
}

const variantStyles = {
  default: "border-white/10 bg-white/5",
  accent: "border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-500/10 to-violet-500/10",
  danger: "border-rose-500/40 bg-rose-500/10",
};

export function MotionCard({
  children,
  delay = 0,
  className = "",
  variant = "default",
}: PropsWithChildren<MotionCardProps>) {
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

  const transition = prefersReducedMotion
    ? undefined
    : { ...cardAnimation.transition, delay };

  return (
    <motion.section
      {...animationProps}
      transition={transition}
      className={cn(
        "rounded-2xl border p-6 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.35)] transition hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.45)]",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </motion.section>
  );
}

export { MotionCard as default };
