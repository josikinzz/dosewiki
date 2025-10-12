import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DevModeProvider } from "./components/dev/DevModeContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <DevModeProvider>
      <App />
    </DevModeProvider>
  </React.StrictMode>
);
