"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Icon } from "@/components/common/Icon";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SignInButtonProps = {
  callbackUrl?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Emphasis of the button. Defaults to the quiet "pill" used when GitHub is
   * one of several sign-in methods; pass "accent" when GitHub is the single
   * primary action on the page.
   */
  variant?: Extract<ButtonProps["variant"], "pill" | "accent">;
};

export function SignInButton({
  callbackUrl = "/dev",
  disabled = false,
  className,
  variant = "pill",
}: SignInButtonProps) {
  const [isStarting, setIsStarting] = useState(false);

  const handleClick = async () => {
    setIsStarting(true);
    await signIn("github", { callbackUrl });
  };

  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled || isStarting}
      onClick={() => void handleClick()}
      className={cn("min-h-11", className)}
      aria-busy={isStarting}
    >
      <Icon icon="lucide:git-branch" size={16} className={`h-4 w-4 ${isStarting ? "animate-pulse" : ""}`} />
      {isStarting ? "Opening GitHub…" : "Continue with GitHub"}
    </Button>
  );
}
