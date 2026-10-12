import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme } from "./theme/applyTheme";
import spaceship from "../../packages/themes/spaceship.json";
import "./index.css";

applyTheme(spaceship);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
