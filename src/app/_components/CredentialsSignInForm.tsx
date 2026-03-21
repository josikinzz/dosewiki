"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CredentialsSignInFormProps = {
  callbackUrl: string;
};

export function CredentialsSignInForm({ callbackUrl }: CredentialsSignInFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      username,
      password,
      callbackUrl,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setError("Invalid credentials.");
      return;
    }

    window.location.href = result.url ?? callbackUrl;
  };

  const errorId = error ? "credentials-sign-in-error" : undefined;

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-black/10 p-5">
      <div className="space-y-1">
        <Label htmlFor="username" className="text-sm font-medium text-white/80">Username</Label>
        <Input
          id="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          aria-describedby={errorId}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="password" className="text-sm font-medium text-white/80">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          aria-describedby={errorId}
        />
      </div>

      {error ? <p id={errorId} role="alert" className="text-sm text-rose-300">{error}</p> : null}

      <Button
        type="submit"
        variant="pill"
        disabled={isSubmitting}
        className="min-h-11"
      >
        {isSubmitting ? "Signing in…" : "Sign in with credentials"}
      </Button>
    </form>
  );
}
