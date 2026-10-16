"use client";

import { useState, type FormEvent } from "react";

import { postMailingListSignup, type MailingList } from "./subscribe";

export type MailingListSignupStatus = "idle" | "pending" | "success" | "error";

export function useMailingListSignup(list: MailingList) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<MailingListSignupStatus>("idle");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "pending") return;
    setStatus("pending");
    const result = await postMailingListSignup(email, list, website);
    if (result.ok === false) {
      setError(result.message);
      setStatus("error");
      return;
    }
    setStatus("success");
  };

  return { email, setEmail, website, setWebsite, status, error, submit };
}

export function MailingListHoneypotField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
      aria-hidden="true"
    >
      <label htmlFor={id}>Website</label>
      <input
        id={id}
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
