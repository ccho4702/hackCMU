"use client";

import { useId } from "react";

export function ProviderMark({provider}) {
  const id=useId();
  return <span className={`provider-mark provider-mark-${provider.toLowerCase()}`} aria-hidden="true">
    {provider==="Gemini" ? <svg viewBox="0 0 32 32" focusable="false"><defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#427bf4"/><stop offset="1" stopColor="#ac87e4"/></linearGradient></defs><path fill={`url(#${id})`} d="M16 1C18 11 21 14 31 16C21 18 18 21 16 31C14 21 11 18 1 16C11 14 14 11 16 1Z"/></svg>
      : provider==="ElevenLabs" ? <span className="provider-voice-bars"><i/><i/></span>
      : <span className="provider-preparing-dot"/>}
  </span>;
}

export default function ProviderProgress({provider,title,detail,compact=false,announce=false}) {
  const Title=compact?"p":"h2";
  return <div className={`provider-progress ${compact?"provider-progress-compact":""}`} data-provider={provider}
    role={announce?"status":undefined} aria-live={announce?"polite":undefined} aria-atomic={announce?"true":undefined}>
    <div className="provider-progress-row"><ProviderMark provider={provider}/><div className="provider-progress-copy">
      <span className="provider-progress-name">{provider}<span className="provider-working-dot" aria-hidden="true"/></span>
      <Title className="provider-progress-title">{title}</Title>
      {detail&&<p className="provider-progress-detail">{detail}</p>}
    </div></div>
    <div className="provider-progress-track" aria-hidden="true"><i/></div>
  </div>;
}
