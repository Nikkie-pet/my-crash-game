import React from 'react';
import { useTranslation } from 'react-i18next';
import Game from './Game';

function App() {
  const { i18n } = useTranslation();
  const [muted, setMuted] = React.useState(() => localStorage.getItem('muted') === '1');

  const changeLanguage = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('lang', lang);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('muted', next ? '1' : '0');
    // pošleme custom event, aby Game.jsx věděl o změně
    window.dispatchEvent(new CustomEvent('cg-mute-change', { detail: { muted: next } }));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
      {/* Horní lišta */}
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => changeLanguage('cs')}
          className="px-3 py-1 bg-blue-600 rounded"
        >
          CZ
        </button>
        <button
          onClick={() => changeLanguage('en')}
          className="px-3 py-1 bg-green-600 rounded"
        >
          EN
        </button>
        <button
          onClick={toggleMute}
          className={`px-3 py-1 rounded ${muted ? 'bg-gray-700' : 'bg-yellow-600'}`}
          title="Toggle sound"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Herní komponenta */}
      <Game />
    </div>
  );
}

export default App;