import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV) {
  // Handy for manual testing in the browser console.
  import("./lib/db").then((m) => ((window as unknown as { db: unknown }).db = m.db));
}
