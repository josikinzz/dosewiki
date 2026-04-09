"use client";

import { useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import { Button, type ButtonProps } from "@/components/ui/button";

type SignOutButtonProps = Omit<ButtonProps, "onClick" | "type"> & {
  callbackUrl?: string;
  children?: ReactNode;
};

export function SignOutButton({
  callbackUrl = "/sign-in",
  children = "Sign out",
  className = "min-h-11",
  disabled,
  variant = "pill",
  ...props
}: SignOutButtonProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  return (
    <Button
      type="button"
      variant={variant}
      onClick={() => {
        setIsSigningOut(true);
        void signOut({ callbackUrl });
      }}
      className={className}
      disabled={disabled || isSigningOut}
      aria-busy={isSigningOut}
      {...props}
    >
      {isSigningOut ? "Signing out..." : children}
    </Button>
  );
}
