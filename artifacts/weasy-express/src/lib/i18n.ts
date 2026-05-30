import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import fr from "./locales/fr";
import ar from "./locales/ar";
import en from "./locales/en";

export const SUPPORTED_LANGUAGES = ["fr", "ar", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const RTL_LANGUAGES: SupportedLanguage[] = ["ar"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      ar: { translation: ar },
      en: { translation: en },
    },
    fallbackLng: "fr",
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "weasy_lang",
    },
  });

const applyDir = (lng: string) => {
  const isRtl = RTL_LANGUAGES.includes(lng as SupportedLanguage);
  if (typeof document !== "undefined") {
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lng;
  }
};

applyDir(i18n.language);
i18n.on("languageChanged", applyDir);

export default i18n;
