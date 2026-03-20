"use client";

import { signIn } from "next-auth/react";

type SignInButtonProps = {
  callbackUrl?: string;
  disabled?: boolean;
};

export function SignInButton({ callbackUrl = "/dev", disabled = false }: SignInButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void signIn("github", { callbackUrl })}
      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:border-fuchsia-400/40 hover:bg-fuchsia-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      Sign in
    </button>
  );
}
