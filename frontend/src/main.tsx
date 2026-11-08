import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./i18n";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./components/Toast";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider><ThemeProvider><ToastProvider><App /></ToastProvider></ThemeProvider></I18nProvider>
  </React.StrictMode>,
);
