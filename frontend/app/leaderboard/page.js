import Link from "next/link";
import StudioHeader from "@/components/StudioHeader";
export default function Leaderboard() {
  return <div className="studio-app"><StudioHeader title="Practice History" subtitle="Compare your own voice trials"/><main className="studio-container"><section className="panel history-intro"><h2>Your progress, one trial at a time.</h2><p>Open Voice Practice to see the recordings and five speech measures for your latest session.</p><Link className="button primary-button" href="/practice">Open practice history →</Link></section></main></div>;
}
