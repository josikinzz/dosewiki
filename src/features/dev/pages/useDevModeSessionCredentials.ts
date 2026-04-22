import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

type VerifyDevCredentials = (
  options?: { username?: string; password?: string },
) => Promise<{ username: string; password: string; key: string }>;

type UseDevModeSessionCredentialsArgs = {
  hasAuthenticatedSession: boolean;
  sessionProfileKey: string;
};

type UseDevModeSessionCredentialsResult = {
  passwordKey: string | null;
  setPasswordKey: Dispatch<SetStateAction<string | null>>;
  verifyDevCredentials: VerifyDevCredentials;
};

export function useDevModeSessionCredentials({
  hasAuthenticatedSession,
  sessionProfileKey,
}: UseDevModeSessionCredentialsArgs): UseDevModeSessionCredentialsResult {
  const [passwordKey, setPasswordKey] = useState<string | null>(null);

  const verifyDevCredentials = useCallback<VerifyDevCredentials>(
    async (_options) => {
      if (!hasAuthenticatedSession) {
        throw new Error("Sign in before continuing.");
      }

      const matchedKey = sessionProfileKey || "USER";
      const authSessionCredential = "__AUTHJS_SESSION__";
      setPasswordKey(matchedKey);

      return {
        username: matchedKey,
        password: authSessionCredential,
        key: matchedKey,
      };
    },
    [hasAuthenticatedSession, sessionProfileKey],
  );

  return {
    passwordKey,
    setPasswordKey,
    verifyDevCredentials,
  };
}
