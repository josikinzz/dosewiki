export const cardAnimation = {
  // The shared section entrance: a short settle on the same curve as
  // --ease-out, at the --motion-base duration, rather than a 14px rise.
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, ease: [0.25, 1, 0.5, 1] as [number, number, number, number] },
};
