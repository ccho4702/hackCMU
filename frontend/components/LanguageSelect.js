"use client";

import { SCRIPT_STYLES } from "@/lib/script-styles";

export function LanguageSelect({ value, onChange, scriptStyle="presentation", onScriptStyleChange, disabled=false }) {
  const selectedStyle=SCRIPT_STYLES.find(option=>option.value===scriptStyle) || SCRIPT_STYLES[0];
  return (
    <section className="session-settings" aria-label="Session settings">
      <div className="session-settings-heading"><h2>Session settings</h2><p>Set the context for your next take.</p></div>
      <div className="session-settings-fields">
        <label>
          <span>Presentation language</span>
          <select value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>
            <option value="en">English</option><option value="ko">Korean</option>
          </select>
          <small>The language you’ll speak.</small>
        </label>
        {onScriptStyleChange && <label>
          <span>Script style</span>
          <select value={scriptStyle} disabled={disabled} onChange={event=>onScriptStyleChange(event.target.value)}>
            {SCRIPT_STYLES.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <small>{selectedStyle.description}</small>
        </label>}

      </div>
    </section>
  );
}
