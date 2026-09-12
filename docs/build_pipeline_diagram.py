"""
파이프라인 플로우차트 생성기. 단순 박스 + 화살표. README 폭에 맞춘 세로 흐름.
출력 (같은 폴더): pipeline-dark.svg/png, pipeline-light.svg/png. PNG 는 headless Chrome 이 있을 때.
"""
from __future__ import annotations
import html, subprocess
from pathlib import Path

OUT = Path(__file__).parent
W, H = 1200, 1270
FONT = "'Pretendard', 'Inter', -apple-system, 'Helvetica Neue', Arial, sans-serif"
BW, BH = 300, 74
X = {"L": 90, "C": 450, "R": 810}

THEMES = {
    "dark":  {"bg": "#0D1117", "box": "#161B22", "ink": "#F0F3F6", "muted": "#9AA4AF", "line": "#7D8590", "rule": "#30363D"},
    "light": {"bg": "#FFFFFF", "box": "#FFFFFF", "ink": "#1F2328", "muted": "#59636E", "line": "#8C959F", "rule": "#D0D7DE"},
}
C = {
    "user":   "#6C8EB5", "mp": "#E0A93F", "local": "#8B949E", "gemini": "#5FA86A",
    "eleven": "#E07A50", "out": "#C9A57A", "score": "#A08BD6", "crown": "#E3B341",
}

# id: (col, y, color, title, subtitle)
N = {
    "signin":  ("C", 90,   "user",   "Sign in",              "name + email · no password"),
    "live":    ("C", 200,  "user",   "Live session",         "camera · mic · MediaRecorder"),
    "mp":      ("R", 200,  "mp",     "MediaPipe feedback",   "frames → gaze · head pose · blink"),
    "video":   ("C", 310,  "local",  "Rehearsal video",      "+ language · accent"),
    "gvideo":  ("L", 440,  "gemini", "Gemini video",         "nonverbal + vocal, timestamped"),
    "audio":   ("R", 440,  "local",  "Extract audio",        "ffmpeg · 16 kHz mono"),
    "coach":   ("L", 550,  "out",    "Timestamped coaching", "nonverbal · vocal · click to seek"),
    "asr":     ("C", 550,  "eleven", "ElevenLabs Scribe",    "transcript"),
    "ivc":     ("R", 550,  "eleven", "Voice clone",          "your voice · cached per user"),
    "gscript": ("C", 660,  "gemini", "Gemini script",        "issues + improved script"),
    "tts":     ("R", 660,  "eleven", "ElevenLabs TTS",       "with word timestamps"),
    "script":  ("C", 770,  "out",    "Improved script",      "original vs revised"),
    "paudio":  ("R", 770,  "out",    "Practice audio",       "improved script in your voice"),
    "trials":  ("C", 890,  "score",  "Practice trials",      "mic only · same script · repeat"),
    "measure": ("C", 1000, "score",  "Five measures",        ["pronunciation · pace · rhythm", "intonation · emphasis · words to revisit"]),
    "crown":   ("C", 1128, "crown",  "👑 Leaderboard",       "best take per recording · your history"),
}
# (src, dst, kind, label)  kind: "v" 세로/꺾임, "h" 가로, "hd" 가로 점선
E = [
    ("signin", "live", "v", ""), ("live", "mp", "hd", ""), ("live", "video", "v", "upload the take"),
    ("video", "gvideo", "v", ""), ("video", "audio", "v", ""),
    ("gvideo", "coach", "v", ""), ("audio", "asr", "v", ""), ("audio", "ivc", "v", ""),
    ("asr", "gscript", "v", ""), ("ivc", "tts", "v", ""), ("gscript", "tts", "h", ""),
    ("gscript", "script", "v", ""), ("tts", "paudio", "v", ""),
    ("paudio", "trials", "v", ""), ("trials", "measure", "v", ""), ("measure", "crown", "v", "trial score"),
]
OUTPUTS = {"coach", "script", "paudio"}

def esc(s): return html.escape(s, quote=True)
def box_h(i):
    return 92 if isinstance(N[i][4], list) else BH

def box(i):
    col, y, *_ = N[i]; x = X[col]; h = box_h(i)
    return x, y, x + BW, y + h, x + BW / 2, y + h / 2

def arrow(e, t):
    s, d, kind, label = e
    sx0, sy0, sx1, sy1, scx, scy = box(s); tx0, ty0, tx1, ty1, tcx, tcy = box(d)
    col = t["line"]; lab = ""
    if kind == "v":
        if abs(scx - tcx) < 1:
            path = f'M{scx},{sy1} L{tcx},{ty0}'
            lx, ly, anchor = scx + 12, (sy1 + ty0) / 2 + 5, "start"
        else:
            my = sy1 + (ty0 - sy1) / 2
            r = 10; dirx = 1 if tcx > scx else -1
            path = (f'M{scx},{sy1} L{scx},{my-r} Q{scx},{my} {scx+r*dirx},{my} '
                    f'L{tcx-r*dirx},{my} Q{tcx},{my} {tcx},{my+r} L{tcx},{ty0}')
            lx, ly, anchor = (scx + tcx) / 2, my - 8, "middle"
        d_attr = ""
    else:
        path = f'M{sx1},{scy} L{tx0},{tcy}'
        lx, ly, anchor = (sx1 + tx0) / 2, scy - 10, "middle"
        d_attr = ' stroke-dasharray="7 6"' if kind == "hd" else ""
    if label:
        lab = (f'<text x="{lx}" y="{ly}" text-anchor="{anchor}" font-size="13" font-style="italic" fill="{t["muted"]}" '
               f'paint-order="stroke" stroke="{t["bg"]}" stroke-width="5" stroke-linejoin="round">{esc(label)}</text>')
    return (f'<path d="{path}" fill="none" stroke="{col}" stroke-width="2.5" stroke-linejoin="round" '
            f'marker-end="url(#arrow)"{d_attr}/>' + lab)

def loop_back(t):
    """measure → trials, 왼쪽으로 돌아 올라가는 점선"""
    sx0, _, _, _, _, scy = box("measure"); tx0, _, _, _, _, tcy = box("trials")
    bulge = 110
    path = f'M{sx0},{scy} C{sx0-bulge},{scy} {tx0-bulge},{tcy} {tx0},{tcy}'
    return (f'<path d="{path}" fill="none" stroke="{C["score"]}" stroke-width="2.5" stroke-dasharray="7 6" marker-end="url(#arrowScore)"/>'
            f'<text x="{sx0-bulge*0.78}" y="{(scy+tcy)/2+5}" text-anchor="middle" font-size="13" font-style="italic" fill="{t["muted"]}">next take</text>')

def node(i, t):
    col, y, ck, title, sub = N[i]; x = X[col]; c = C[ck]; h = box_h(i)
    fill = t["box"]
    stroke_w = 2.5 if i == "crown" else 1.5
    stroke = c if i in OUTPUTS or i == "crown" else t["rule"]
    return "\n".join([
        f'<rect x="{x}" y="{y}" width="{BW}" height="{h}" rx="12" fill="{fill}" stroke="{stroke}" stroke-width="{stroke_w}"/>',
        f'<rect x="{x}" y="{y}" width="7" height="{h}" rx="3.5" fill="{c}"/>',
        f'<text x="{x+24}" y="{y+31}" font-size="20" font-weight="700" fill="{t["ink"]}">{esc(title)}</text>',
    ] + [f'<text x="{x+24}" y="{y+54+j*18}" font-size="13.5" fill="{t["muted"]}">{esc(line)}</text>'
         for j, line in enumerate(sub if isinstance(sub, list) else [sub])])

def build_svg(theme):
    t = THEMES[theme]
    defs = [
        f'<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{t["line"]}"/></marker>',
        f'<marker id="arrowScore" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{C["score"]}"/></marker>',
    ]
    title = (f'<text x="90" y="52" font-size="26" font-weight="800" fill="{t["ink"]}" letter-spacing="-0.4">How one rehearsal becomes a better take</text>')
    legend_items = [("Gemini", "gemini"), ("ElevenLabs", "eleven"), ("MediaPipe", "mp"), ("Local", "local"), ("Local scoring", "score"), ("What you see", "out")]
    lx = 90; legend = []
    for name, ck in legend_items:
        legend.append(f'<rect x="{lx}" y="{H-44}" width="12" height="12" rx="3" fill="{C[ck]}"/>')
        legend.append(f'<text x="{lx+18}" y="{H-33}" font-size="12.5" fill="{t["muted"]}">{esc(name)}</text>')
        lx += 18 + 7 * len(name) + 22
    storage = (f'<text x="{W-90}" y="{H-33}" text-anchor="end" font-size="12.5" fill="{t["muted"]}">'
               f'files · artifacts/runs/{{run_id}} &#183; MongoDB Atlas · users, runs, practice_trials</text>')
    body = "\n".join([f'<rect width="{W}" height="{H}" fill="{t["bg"]}"/>', title,
                      "\n".join(arrow(e, t) for e in E), loop_back(t),
                      "\n".join(node(i, t) for i in N), "\n".join(legend), storage])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="{FONT}">\n'
            f'<defs>\n' + "\n".join(defs) + '\n</defs>\n' + body + '\n</svg>\n')

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
def png(svg_path, png_path):
    if not Path(CHROME).exists():
        print("  (Chrome 없음, PNG 생략)"); return
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
                    f"--window-size={W},{H}", f"--screenshot={png_path}", f"file://{svg_path}"],
                   check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

if __name__ == "__main__":
    for theme in THEMES:
        p = OUT / f"pipeline-{theme}.svg"; p.write_text(build_svg(theme), encoding="utf-8")
        png(p, OUT / f"pipeline-{theme}.png"); print("wrote", p.name, "+ png")
