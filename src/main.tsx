import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DevModeProvider } from "./components/dev/DevModeContext";
import "./styles.css";

const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
const isSafari =
  userAgent.includes("Safari") &&
  !userAgent.includes("Chrome") &&
  !userAgent.includes("Chromium") &&
  !userAgent.includes("Android");

if (isSafari) {
  document.documentElement.classList.add("is-safari");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DevModeProvider>
      <App />
    </DevModeProvider>
  </React.StrictMode>
);
