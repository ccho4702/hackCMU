"use client";

import { exportCsvUrl, exportJsonUrl } from "@/lib/api/client";
import { Button } from "@/components/ui/button";

export function ExportMenu({ analysisId }: { analysisId: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => download(exportJsonUrl(analysisId, true), `${analysisId}.json`)}>
        JSON
      </Button>
      <Button variant="outline" size="sm" onClick={() => download(exportJsonUrl(analysisId, false), `${analysisId}.windows.json`)}>
        JSON without frames
      </Button>
      <Button variant="outline" size="sm" onClick={() => download(exportCsvUrl(analysisId), `${analysisId}.csv`)}>
        CSV
      </Button>
    </div>
  );
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
