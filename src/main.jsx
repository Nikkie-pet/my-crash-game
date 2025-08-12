import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";   // Tailwind MUSÍ být importován tady
import "./i18n";        // Inicializace překladů
import App from "./App.jsx";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error('V index.html chybí <div id="root"></div>');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);