"use client";

import { useContext } from "react";
import { EditorLauncherEligibilityContext } from "@/features/editor-launcher/context";
import { MailingListInvite } from "./MailingListInvite";

export function HomeMailingListCorner() {
  const hasEditorLauncher = useContext(EditorLauncherEligibilityContext);

  return hasEditorLauncher ? null : (
    <MailingListInvite className="theme-home-corner-widget fixed bottom-4 right-4 z-20 sm:bottom-6 sm:right-6" />
  );
}
