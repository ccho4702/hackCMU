"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clapperboard, Mic, Trophy } from "lucide-react";
import { Card, PageShell } from "@/components/ui/studio";
import { apiGet } from "@/lib/coaching-api";
import { useRequireUser } from "@/lib/useUser";
import { cn } from "@/lib/utils";

// 내 영상(run) 목록 → 하나 고르면 그 영상에 대한 트라이얼 리더보드.
// 데이터: GET /api/me/runs, GET /api/runs/{run_id}/leaderboard (backend/routers/history.py)

const AXES = [
  ["pronunciation", "Pronunciation"],
  ["rate", "Pace"],
  ["rhythm", "Rhythm"],
  ["intonation", "Intonation"],
  ["stress", "Emphasis"],
];

const STATUS = {
  success: ["Ready", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  running: ["Processing", "bg-amber-50 text-amber-700 ring-amber-200"],
  queued: ["Queued", "bg-amber-50 text-amber-700 ring-amber-200"],
  failed: ["Failed", "bg-rose-50 text-rose-700 ring-rose-200"],
  missing: ["Files missing", "bg-slate-100 text-slate-500 ring-slate-200"],
};

const pct = (v) => (v == null ? "–" : Math.round(v * 100));
const when = (iso) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function HistoryPage() {
  const user = useRequireUser();
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [board, setBoard] = useState(null);
  const [boardError, setBoardError] = useState(null);

  useEffect(() => {
    if (!user) return;
    apiGet("/me/runs")
      .then((data) => {
        setRuns(data.runs);
        const wanted = new URLSearchParams(window.location.search).get("run");
        const pick = data.runs.find((r) => r.run_id === wanted) || data.runs.find((r) => r.trial_count > 0) || data.runs[0] || null;
        setSelected(pick ? pick.run_id : null);
      })
      .catch((e) => setError(e.message));
  }, [user]);

  // 응답에 run_id 가 들어 있어서 "지금 고른 run 의 것인지" 를 파생값으로 판단한다 (effect 안 동기 setState 회피)
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    apiGet(`/runs/${selected}/leaderboard`)
      .then((data) => { if (!cancelled) setBoard(data); })
      .catch((e) => { if (!cancelled) setBoardError({ run_id: selected, message: e.message }); });
    return () => { cancelled = true; };
  }, [selected]);

  const current = runs?.find((r) => r.run_id === selected) || null;
  const boardFor = board && board.run_id === selected ? board : null;
  const boardErrorFor = boardError && boardError.run_id === selected ? boardError.message : "";

  return (
    <PageShell title="Practice History" subtitle={user ? `${user.name} · every recording and trial` : "Your recordings and trials"}>
      {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ---- 내 영상 목록 ---- */}
        <Card title="My recordings" action={runs ? <span className="text-xs text-slate-500">{runs.length} total</span> : null}>
          {!runs && !error ? <p className="text-sm text-slate-500">Loading your recordings…</p> : null}
          {runs && runs.length === 0 ? (
            <div className="rounded-xl bg-[#f4f7ff] p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-900">No recordings yet.</p>
              <p className="mt-1">Record a live session first. Its improved script and reference voice will show up here.</p>
              <Link href="/live" className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white">
                <Clapperboard className="size-3.5" /> Start recording
              </Link>
            </div>
          ) : null}
          <ul className="flex flex-col gap-2">
            {runs?.map((run) => {
              const [label, tone] = STATUS[run.status] || STATUS.missing;
              const active = run.run_id === selected;
              return (
                <li key={run.run_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(run.run_id)}
                    className={cn(
                      "w-full rounded-xl px-4 py-3 text-left ring-1 transition",
                      active ? "bg-primary/5 ring-primary/40" : "bg-white ring-slate-200/70 hover:ring-primary/30",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-500">{when(run.created_at)} · {run.language?.toUpperCase() || "EN"}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", tone)}>{label}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-900">{run.title || "Improved script not ready yet."}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Mic className="size-3.5" /> {run.trial_count} trials</span>
                      {run.best_overall != null ? (
                        <span className="flex items-center gap-1 font-medium text-primary"><Trophy className="size-3.5" /> best {pct(run.best_overall)}</span>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* ---- 리더보드 ---- */}
        <Card
          title={current ? `Leaderboard · ${when(current.created_at)}` : "Leaderboard"}
          action={current ? (
            <div className="flex gap-2">
              <Link href={current.urls.evaluation} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:ring-primary/40">Evaluation</Link>
              {current.has_reference ? (
                <Link href={current.urls.practice} className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">Practice</Link>
              ) : null}
            </div>
          ) : null}
        >
          {!current ? <p className="text-sm text-slate-500">Pick a recording to see its trials.</p> : null}
          {current && boardErrorFor ? <p className="text-sm text-rose-700">{boardErrorFor}</p> : null}
          {current && !boardFor && !boardErrorFor ? <p className="text-sm text-slate-500">Loading trials…</p> : null}
          {boardFor && boardFor.trials.length === 0 ? (
            <div className="rounded-xl bg-[#f4f7ff] p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-900">No trials for this recording yet.</p>
              <p className="mt-1">Open Practice, read the improved script in your own voice, and each take will be ranked here.</p>
            </div>
          ) : null}
          {boardFor && boardFor.trials.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Trial</th>
                    {AXES.map(([key, label]) => <th key={key} className="py-2 pr-3 text-right">{label}</th>)}
                    <th className="py-2 pr-3 text-right">Avg</th>
                    <th className="py-2">Listen</th>
                  </tr>
                </thead>
                <tbody>
                  {boardFor.trials.map((t) => (
                    <tr key={t.trial_id} className={cn("border-t border-slate-100", t.best && "bg-primary/5")}>
                      <td className="py-2 pr-3 font-semibold tabular-nums text-slate-900">{t.rank ?? "–"}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span>Trial {t.trial_number}</span>
                          {t.best ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">BEST</span> : null}
                        </div>
                        <div className="text-[11px] text-slate-500">{when(t.created_at)}{t.status !== "ok" ? " · unreliable, not ranked" : ""}</div>
                      </td>
                      {AXES.map(([key]) => (
                        <td key={key} className="py-2 pr-3 text-right tabular-nums">
                          {t.axes?.[key] == null ? <span className="text-slate-300">–</span> : (
                            <span className="inline-flex items-center gap-2">
                              <span className="hidden h-1.5 w-12 overflow-hidden rounded-full bg-slate-100 sm:inline-block">
                                <span className="block h-full rounded-full bg-primary" style={{ width: `${pct(t.axes[key])}%` }} />
                              </span>
                              {pct(t.axes[key])}
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums text-slate-900">{pct(t.overall)}</td>
                      <td className="py-2"><audio controls preload="none" src={t.audio_url} className="h-8 w-40" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">Ranked by the plain average of the five measures against your own reference voice. Unreliable takes stay listed but are not ranked.</p>
            </div>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
