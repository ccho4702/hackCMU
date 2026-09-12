import { AppHeader } from "@/components/layout/AppHeader";

export default function StudioHeader({ title, subtitle, runId, children }) {
  return <AppHeader title={title} subtitle={subtitle} runId={runId} right={children} />;
}
