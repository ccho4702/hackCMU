"use client";

import { Download } from "lucide-react";
import { Card } from "@/components/ui/studio";
import { exportCsvUrl, exportJsonUrl } from "@/lib/api/client";

export function ExportMenu({ analysisId }) {
  const options = [
    { label: "JSON", url: exportJsonUrl(analysisId, true), file: `${analysisId}.json` },
    {
      label: "JSON without frames",
      url: exportJsonUrl(analysisId, false),
      file: `${analysisId}.windows.json`,
    },
    { label: "CSV", url: exportCsvUrl(analysisId), file: `${analysisId}.csv` },
  ];

  return (
    <Card title="Export analysis">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => download(option.url, option.file)}
            className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 transition-colors hover:text-primary hover:ring-primary/40"
          >
            <Download className="size-3.5" />
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Canonical JSON/CSV from the API. Numeric fields are unformatted.
      </p>
    </Card>
  );
}

function download(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
