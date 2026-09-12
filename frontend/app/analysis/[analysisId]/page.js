"use client";

import { use } from "react";
import { Workspace } from "@/components/analytics/Workspace";
import { ProgressScreen } from "@/components/upload/ProgressScreen";
import { useAnalysisJob } from "@/hooks/useAnalysisJob";
import { getVideoObjectUrl } from "@/lib/media/videoStore";

export default function AnalysisPage({ params }) {
  const { analysisId } = use(params);
  const { progress, result, error } = useAnalysisJob(analysisId);

  if (!result) {
    return <ProgressScreen progress={progress} error={error} />;
  }

  return <Workspace result={result} videoUrl={getVideoObjectUrl(analysisId)} />;
}
