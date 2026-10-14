"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

/** Reveal a collaboration when a partner's link targets its description. */
export function CollaborationDetails({ id, children, ...props }: ComponentPropsWithoutRef<"details"> & { id: string }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const revealTarget = () => {
      if (window.location.hash === `#${id}` && detailsRef.current) detailsRef.current.open = true;
    };
    revealTarget();
    window.addEventListener("hashchange", revealTarget);
    return () => window.removeEventListener("hashchange", revealTarget);
  }, [id]);
  return <details ref={detailsRef} id={id} {...props}>{children}</details>;
}
