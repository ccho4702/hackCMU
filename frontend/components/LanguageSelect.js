"use client";

import { ACCENTS } from "@/lib/accents";
const selectStyle="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60";

export function LanguageSelect({ value, onChange, accent="original", onAccentChange, disabled=false }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <span>Presentation language</span>
        <select value={value} disabled={disabled} className={selectStyle}
          onChange={event=>{onChange(event.target.value); if(event.target.value!=="en") onAccentChange?.("original");}}>
          <option value="en">English</option>
          <option value="ko">한국어</option>
        </select>
      </label>
      {value==="en" && onAccentChange && <label className="flex items-center gap-2 text-sm text-slate-600">
        <span>Target accent</span>
        <select value={accent} disabled={disabled} className={selectStyle} onChange={event=>onAccentChange(event.target.value)}>
          {ACCENTS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>}
      {value==="en" && accent!=="original" && <p className="w-full text-xs text-slate-500">Used for voice feedback and reference speech. Accent strength can vary with your voice.</p>}
    </div>
  );
}
