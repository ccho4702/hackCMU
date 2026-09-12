import Link from "next/link";

export default function StudioHeader({ title, subtitle, active, runId, children }) {
  const query = runId ? `?run=${runId}` : "";
  const links = [["streaming", "/streaming", "Live Session"], ["evaluation", `/evaluation${query}`, "Evaluation"], ["practice", `/practice${query}`, "Voice Practice"]];
  return <header className="studio-header"><div className="studio-header-inner"><div className="header-title"><Link href="/" aria-label="Back to home" className="back-home">←</Link><div><h1>{title}</h1><p>{subtitle}</p></div></div><nav aria-label="Studio pages">{links.map(([id, href, text]) => <Link key={id} href={href} aria-current={active === id ? "page" : undefined}>{text}</Link>)}</nav>{children && <div className="header-status">{children}</div>}</div></header>;
}
