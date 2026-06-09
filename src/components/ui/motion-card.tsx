import { PropsWithChildren, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cardAnimation } from "@/constants/motion";
import { cn } from "@/lib/utils";
import { surfaceVariants, interactiveSurfaceVariants } from "./surface";

export interface MotionCardProps {
  delay?: number;
  className?: string;
  variant?: "default" | "accent" | "danger";
}

const variantStyles = {
  default: "theme-public-card-subtle",
  accent: "theme-card-surface border-[var(--theme-frosted-panel-border)]",
  danger: "border-[color:var(--theme-danger-border)] bg-[color:var(--theme-danger-bg)] text-[color:var(--theme-danger-text)]",
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
        surfaceVariants({ variant: "muted", padding: "lg", radius: "xl" }),
        interactiveSurfaceVariants({ variant: "card" }),
        "shadow-[0_10px_24px_-14px_rgba(0,0,0,0.28)] hover:shadow-[0_16px_36px_-18px_rgba(0,0,0,0.36)]",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </motion.section>
  );
}

export { MotionCard as default };
