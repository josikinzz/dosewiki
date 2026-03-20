"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/sign-in" })}
      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 hover:text-white"
    >
      Sign out
    </button>
  );
}
