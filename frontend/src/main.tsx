import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme } from "./theme/applyTheme";
import { initI18n } from "./i18n/setup";
import spaceship from "../../packages/themes/spaceship.json";
import "./index.css";
import "./theme/shapes.css";
import "./viewportFit.css";
import { installNoWheelScroll } from "./shell/noWheelScroll";

applyTheme(spaceship);
installNoWheelScroll();

async function boot() {
  await initI18n(localStorage.getItem("st_lang") || "ru");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      void navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          void reg.update();
        })
        .catch(() => undefined);
    });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
