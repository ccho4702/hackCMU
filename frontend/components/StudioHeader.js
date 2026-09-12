import { AppHeader } from "@/components/layout/AppHeader";
export default function StudioHeader({ title, runId, children }) {
  return <AppHeader runId={runId} right={<><span className="hidden text-xs sm:inline">{title}</span>{children}</>}/>;
}
