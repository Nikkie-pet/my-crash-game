import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// překlady
import cs from "./locales/cs.json";
import en from "./locales/en.json";

// zkusíme načíst uložený jazyk, jinak dáme "cs"
let savedLang = "cs";
try {
  const langFromStorage = localStorage.getItem("lang");
  if (langFromStorage) {
    savedLang = langFromStorage;
  }
} catch (error) {
  console.warn("Nepodařilo se načíst uložený jazyk z localStorage:", error);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      cs: { translation: cs },
      en: { translation: en },
    },
    lng: savedLang,      // 👉 výchozí jazyk podle localStorage
    fallbackLng: "en",   // když překlad chybí, použij EN
    interpolation: {
      escapeValue: false // React už escapuje sám
    }
  });

export default i18n;
