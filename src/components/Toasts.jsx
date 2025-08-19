import React, { useEffect, useState } from "react";

let idSeq = 1;

export default function Toasts() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const { message, type = "info", ttl = 3000 } = e.detail || {};
      const id = idSeq++;
      setItems((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    };
    window.addEventListener("cg-toast", onToast);
    return () => window.removeEventListener("cg-toast", onToast);
  }, []);

  const bg = (t) =>
    t === "success"
      ? "bg-emerald-600"
      : t === "error"
      ? "bg-rose-600"
      : "bg-slate-800";

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {items.map((t) => (
        <div
          key={t.id}
          className={`text-white text-sm px-3 py-2 rounded-lg shadow-lg ${bg(t.type)}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// helper – můžeš volat odkudkoli
export function toast(message, type = "info", ttl = 3000) {
  window.dispatchEvent(new CustomEvent("cg-toast", { detail: { message, type, ttl } }));
}