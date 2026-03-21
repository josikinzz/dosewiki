"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="pill"
      onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      className="min-h-11"
    >
      Sign out
    </Button>
  );
}
