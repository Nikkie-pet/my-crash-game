import React from "react";
import Game from "./Game";
import { useTranslation } from "react-i18next";

function App() {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("language", lng);
  };

  return (
    <div className="p-4 text-center">
      <h1 className="text-3xl font-bold mb-4">{t("welcome")}</h1>
      <p>🚀 Nová verze!</p> {/* Test deploy změna */}
      <div className="flex justify-center gap-2 mb-4">
        <button
          className="px-3 py-1 bg-blue-500 text-white rounded"
          onClick={() => changeLanguage("cs")}
        >
          CZ
        </button>
        <button
          className="px-3 py-1 bg-green-500 text-white rounded"
          onClick={() => changeLanguage("en")}
        >
          EN
        </button>
      </div>
      <Game />
    </div>
  );
}

export default App;