"use client";

import { useEffect, useRef } from "react";
import { scrollIntoViewRespectingMotion } from "@/utils/navigation";
import { getMechanismSectionId } from "./mechanismSectionId";

interface MechanismQualifierScrollProps {
  mechanismSlug: string;
  qualifierKey?: string;
}

export function MechanismQualifierScroll({
  mechanismSlug,
  qualifierKey,
}: MechanismQualifierScrollProps) {
  const lastScrolledQualifierRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!qualifierKey) {
      return;
    }

    if (lastScrolledQualifierRef.current === qualifierKey) {
      return;
    }

    const element = document.getElementById(
      getMechanismSectionId(mechanismSlug, qualifierKey),
    );
    if (element) {
      scrollIntoViewRespectingMotion(element, { block: "nearest" });
      lastScrolledQualifierRef.current = qualifierKey;
    }
  }, [mechanismSlug, qualifierKey]);

  return null;
}
