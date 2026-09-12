"use client";

export function LanguageSelect({ value, onChange, disabled = false }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span>Presentation language</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
      >
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </label>
  );
}
