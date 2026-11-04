import { createRoot } from "react-dom/client";
import { PreviewPrototype } from "./PreviewPrototype";
import "../../../src/index.css";
import "./prototype.css";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zh from "../../../src/i18n/zh.json";
await i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh } },
  lng: "zh",
  interpolation: { escapeValue: false },
});
document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<PreviewPrototype />);
