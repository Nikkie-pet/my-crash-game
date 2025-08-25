import React, { useEffect, useState } from "react";
let push;
export function toast(message, type="info", ms=2000){ push?.({message,type,ms}); }
export default function Toasts(){
  const [items,setItems]=useState([]);
  useEffect(()=>{ push=(i)=>{ const id=Date.now()+Math.random(); setItems((p)=>[...p,{id,...i}]); setTimeout(()=>setItems((p)=>p.filter(x=>x.id!==id)), i.ms||2000); };},[]);
  return (
    <div className="fixed top-3 right-3 z-[9999] space-y-2">
      {items.map(t=>(
        <div key={t.id} className={`px-3 py-2 rounded-lg shadow border text-sm
          ${t.type==='success'?'bg-emerald-50 border-emerald-300 text-emerald-800':
            t.type==='error'?'bg-red-50 border-red-300 text-red-800':
            'bg-neutral-50 border-neutral-200 text-slate-800'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}