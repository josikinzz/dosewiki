"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

type SignInButtonProps = {
  callbackUrl?: string;
  disabled?: boolean;
};

export function SignInButton({ callbackUrl = "/dev", disabled = false }: SignInButtonProps) {
  return (
    <Button
      type="button"
      variant="pill"
      disabled={disabled}
      onClick={() => void signIn("github", { callbackUrl })}
      className="min-h-11"
    >
      Sign in
    </Button>
  );
}
