import React from 'react';
import { useTranslation } from 'react-i18next';
import Game from './Game';

function App() {
  const { i18n } = useTranslation();

  // funkce pro změnu jazyka
  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('lang', lng); // uloží volbu pro příště
  };

  // při prvním načtení aplikace zkontrolujeme uložený jazyk
  React.useEffect(() => {
    const savedLang = localStorage.getItem('lang');
    if (savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, [i18n]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Horní lišta s přepínačem jazyka */}
      <div className="flex justify-end p-4 gap-2 border-b border-gray-700">
        <button
          onClick={() => changeLanguage('cs')}
          className={`px-3 py-1 rounded ${
            i18n.language === 'cs' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          CZ
        </button>
        <button
          onClick={() => changeLanguage('en')}
          className={`px-3 py-1 rounded ${
            i18n.language === 'en' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          EN
        </button>
      </div>

      {/* Herní komponenta */}
      <div className="p-4">
        <Game />
      </div>
    </div>
  );
}

export default App;