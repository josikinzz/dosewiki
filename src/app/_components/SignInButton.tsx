"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";

type SignInButtonProps = {
  callbackUrl?: string;
  disabled?: boolean;
};

export function SignInButton({ callbackUrl = "/dev", disabled = false }: SignInButtonProps) {
  const [isStarting, setIsStarting] = useState(false);

  const handleClick = async () => {
    setIsStarting(true);
    await signIn("github", { callbackUrl });
  };

  return (
    <Button
      type="button"
      variant="pill"
      disabled={disabled || isStarting}
      onClick={() => void handleClick()}
      className="min-h-11 transition-[transform,box-shadow] duration-[260ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-px hover:shadow-[0_14px_28px_-18px_rgba(244,114,182,0.7)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      aria-busy={isStarting}
    >
      <GitBranch className={`h-4 w-4 ${isStarting ? "animate-pulse" : ""}`} />
      {isStarting ? "Opening GitHub…" : "Continue with GitHub"}
    </Button>
  );
}
