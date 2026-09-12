"""
파이프라인 다이어그램 생성기. 컬럼 사이를 곡선 리본으로 잇는 Sankey 스타일.
출력: pipeline.svg (정적), pipeline.html (확대·이동 가능한 인터랙티브 래퍼)
"""
from pathlib import Path
import html

OUT = Path(__file__).parent
W, H = 2480, 800
BG, INK, MUTED, RULE = "#FAF7F2", "#23262B", "#6B7078", "#D9D2C5"
FONT = "'Pretendard', 'Inter', -apple-system, 'Helvetica Neue', Arial, sans-serif"

# 자연색 팔레트 (서비스별)
C = {
    "user":   "#5B7A99",   # slate blue  — 사용자·페이지
    "mp":     "#D4A24C",   # ochre       — MediaPipe
    "video":  "#8A8F87",   # stone       — 로컬 처리
    "gemini": "#6B8E5A",   # moss        — Gemini
    "eleven": "#C2704E",   # terracotta  — ElevenLabs
    "out":    "#B08968",   # sand/tan    — 사용자가 보는 결과
    "score":  "#7A6C8F",   # heather     — 로컬 채점
    "crown":  "#C9A227",   # gold        — 리더보드
}

COLS = [80, 348, 616, 884, 1152, 1420, 1688, 1956, 2224]   # x
NW, NH = 230, 82

HEADERS = ["START", "LIVE", "VIDEO", "ANALYSIS", "SPEECH", "WHAT YOU GET", "PRACTICE", "SCORE", "RANK"]

# id: (col, y, color, icon, title, subtitle)
N = {
    "signin":  (0, 390, "user",   "🔑", "Sign in",              ["name + email", "no password"]),
    "live":    (1, 320, "user",   "📹", "Live session",         ["camera · mic", "MediaRecorder keeps the take"]),
    "mp":      (1, 510, "mp",     "👁️", "MediaPipe feedback",   ["gaze · head pose · blink", "real-time overlay"]),
    "video":   (2, 320, "video",  "🎥", "Rehearsal video",      ["+ language · accent"]),
    "gvideo":  (3, 150, "gemini", "✨", "Gemini video",         ["nonverbal + vocal feedback", "timestamped"]),
    "audio":   (3, 390, "video",  "🎵", "Extract audio",        ["ffmpeg · 16 kHz mono"]),
    "asr":     (4, 320, "eleven", "🗣️", "ElevenLabs Scribe",    ["transcript"]),
    "ivc":     (4, 550, "eleven", "🧬", "Voice clone",          ["your voice", "cached per user"]),
    "gscript": (5, 320, "gemini", "✨", "Gemini script",        ["concrete issues", "+ improved script"]),
    "tts":     (5, 550, "eleven", "🔉", "ElevenLabs TTS",       ["improved script, your voice", "with word timestamps"]),
    "coach":   (6, 150, "out",    "💬", "Timestamped coaching", ["nonverbal · vocal", "click to seek in the video"]),
    "script":  (6, 320, "out",    "📝", "Improved script",      ["original vs revised"]),
    "paudio":  (6, 550, "out",    "🔊", "Practice audio",       ["your reference voice"]),
    "trials":  (7, 550, "score",  "🎙️", "Practice trials",      ["mic only · same script", "as many takes as you like"]),
    "measure": (8, 540, "score",  "📊", "Five measures",        ["pronunciation · pace · rhythm", "intonation · emphasis", "+ words to revisit"]),
    "crown":   (8, 320, "crown",  "👑", "Leaderboard",          ["best take per recording", "your recording history"]),
}
# edges: (src, dst, weight, label)
E = [
    ("signin", "live", 14, ""), ("live", "mp", 10, "JPEG frames"), ("live", "video", 14, ""),
    ("video", "gvideo", 11, ""), ("video", "audio", 14, ""),
    ("audio", "asr", 14, ""), ("audio", "ivc", 11, ""),
    ("asr", "gscript", 14, ""), ("gscript", "tts", 14, ""), ("ivc", "tts", 11, ""),
    ("gvideo", "coach", 11, ""), ("gscript", "script", 11, ""), ("tts", "paudio", 14, ""),
    ("paudio", "trials", 14, ""), ("trials", "measure", 14, ""), ("measure", "crown", 14, "trial score"),
]

def node_xy(i):
    col, y, *_ = N[i]
    return COLS[col], y


def node_h(i):
    sub = N[i][5]
    n = len(sub) if isinstance(sub, list) else 1
    return 44 + 17 * n + 8

def esc(s):
    return html.escape(s, quote=True)

def ribbon(src, dst, w, label, k):
    x1, y1 = node_xy(src); x2, y2 = node_xy(dst)
    sx, sy = x1 + NW, y1 + node_h(src) / 2
    tx, ty = x2, y2 + node_h(dst) / 2
    dx = (tx - sx) * 0.5
    c1, c2 = C[N[src][2]], C[N[dst][2]]
    gid = f"g{k}"
    grad = (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{sx}" y1="0" x2="{tx}" y2="0">'
            f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient>')
    path = (f'<path d="M{sx},{sy} C{sx+dx},{sy} {tx-dx},{ty} {tx},{ty}" fill="none" stroke="url(#{gid})" '
            f'stroke-width="{w}" stroke-opacity="0.55" stroke-linecap="butt"/>')
    lab = ""
    if label:
        mx, my = (sx + tx) / 2, (sy + ty) / 2 - w / 2 - 8
        lab = (f'<text x="{mx}" y="{my}" text-anchor="middle" font-family="{FONT}" font-size="15" '
               f'font-style="italic" fill="{MUTED}">{esc(label)}</text>')
    return grad, path + lab

def loop_back():
    """measure → trials 'next take' 점선 되돌이"""
    x1, y1 = node_xy("measure"); x2, y2 = node_xy("trials")
    sx, sy = x1 + NW / 2, y1 + node_h("measure")
    tx, ty = x2 + NW / 2, y2 + node_h("trials")
    dip = 96
    p = (f'<path d="M{sx},{sy} C{sx},{sy+dip} {tx},{ty+dip} {tx},{ty}" fill="none" stroke="{C["score"]}" '
         f'stroke-width="2.5" stroke-dasharray="7 7" stroke-opacity="0.8" marker-end="url(#arrow)"/>')
    lab = (f'<text x="{(sx+tx)/2}" y="{sy+dip*0.75+6}" text-anchor="middle" font-family="{FONT}" font-size="15" '
           f'font-style="italic" fill="{MUTED}">next take</text>')
    return p + lab

def node(i):
    col, y, ck, icon, title, sub = N[i]
    x = COLS[col]; c = C[ck]; NH = node_h(i)
    r = 14
    g = [f'<g class="node" data-id="{i}">',
         f'<rect x="{x}" y="{y}" width="{NW}" height="{NH}" rx="{r}" fill="#FFFFFF" stroke="{RULE}" stroke-width="1.5" filter="url(#shadow)"/>',
         f'<rect x="{x}" y="{y}" width="8" height="{NH}" rx="4" fill="{c}"/>',
         f'<text x="{x+24}" y="{y+31}" font-family="{FONT}" font-size="19" font-weight="700" fill="{INK}">{esc(icon)} {esc(title)}</text>']
    subs = sub if isinstance(sub, list) else [sub]
    for j, line in enumerate(subs):
        g.append(f'<text x="{x+24}" y="{y+53+j*17}" font-family="{FONT}" font-size="13" fill="{MUTED}">{esc(line)}</text>')
    g.append('</g>')
    return "\n".join(g)

def build_svg():
    defs = ['<filter id="shadow" x="-10%" y="-10%" width="120%" height="140%">'
            '<feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.08"/></filter>',
            f'<marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{C["score"]}"/></marker>']
    ribbons = []
    for k, (s, d, w, lab) in enumerate(E):
        g, p = ribbon(s, d, w, lab, k); defs.append(g); ribbons.append(p)
    ribbons.append(loop_back())

    heads = []
    for i, h in enumerate(HEADERS):
        x = COLS[i]
        heads.append(f'<text x="{x}" y="96" font-family="{FONT}" font-size="13" font-weight="700" letter-spacing="2.5" fill="{MUTED}">{esc(h)}</text>')
        heads.append(f'<line x1="{x}" y1="106" x2="{x+NW}" y2="106" stroke="{RULE}" stroke-width="1.5"/>')

    title = (f'<text x="80" y="48" font-family="{FONT}" font-size="30" font-weight="800" fill="{INK}" letter-spacing="-0.5">'
             f'How one rehearsal becomes a better take</text>'
             f'<text x="80" y="72" font-family="{FONT}" font-size="15" fill="{MUTED}">'
             f'Sign in → live session → coaching pipeline → what you see → practice loop → leaderboard. '
             f'Ribbon width marks the main path; colors mark who does the work.</text>')

    legend_items = [("Gemini", C["gemini"]), ("ElevenLabs", C["eleven"]), ("MediaPipe", C["mp"]),
                    ("Local processing", C["video"]), ("Local scoring · no API", C["score"]), ("What you see", C["out"])]
    lx = 80; legend = []
    for name, col in legend_items:
        legend.append(f'<circle cx="{lx+6}" cy="{H-58}" r="6" fill="{col}"/>')
        legend.append(f'<text x="{lx+20}" y="{H-53}" font-family="{FONT}" font-size="14" fill="{MUTED}">{esc(name)}</text>')
        lx += 20 + 9 * len(name) + 36
    storage = (f'<text x="{W-80}" y="{H-53}" text-anchor="end" font-family="{FONT}" font-size="14" fill="{MUTED}">'
               f'Storage · artifacts/runs/{{run_id}} for files · MongoDB Atlas for users, runs, practice_trials</text>')

    body = "\n".join([
        f'<rect width="{W}" height="{H}" fill="{BG}"/>',
        title, "\n".join(heads),
        '<g id="ribbons">', "\n".join(ribbons), '</g>',
        '<g id="nodes">', "\n".join(node(i) for i in N), '</g>',
        "\n".join(legend), storage,
    ])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
            f'font-family="{FONT}">\n<defs>\n' + "\n".join(defs) + '\n</defs>\n' + body + '\n</svg>\n')

HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mellonaires pipeline</title>
<style>
  html,body{margin:0;height:100%;background:__BG__;color:__INK__;font-family:__FONT__;overflow:hidden}
  #stage{position:fixed;inset:0;cursor:grab;touch-action:none}
  #stage.dragging{cursor:grabbing}
  #stage svg{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;user-select:none}
  #hud{position:fixed;right:16px;bottom:16px;display:flex;gap:8px;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);
       border:1px solid __RULE__;border-radius:999px;padding:6px 8px;font-size:13px}
  #hud button{border:0;background:transparent;font:inherit;font-weight:700;color:__INK__;padding:6px 10px;border-radius:999px;cursor:pointer}
  #hud button:hover{background:#EFE9DF}
  #hint{position:fixed;left:16px;bottom:16px;font-size:12px;color:__MUTED__;background:rgba(255,255,255,.7);padding:6px 10px;border-radius:999px}
</style></head><body>
<div id="stage">__SVG__</div>
<div id="hint">scroll to zoom · drag to pan · double-click to reset</div>
<div id="hud"><button data-z="-1">−</button><button data-z="1">+</button><button id="fit">Fit</button><button id="reset">100%</button></div>
<script>
(function(){
  const stage=document.getElementById('stage'), svg=stage.querySelector('svg');
  const VW=__W__, VH=__H__; let s=1, tx=0, ty=0;
  const apply=()=>{svg.style.transform=`translate(${tx}px,${ty}px) scale(${s})`;};
  const fit=()=>{const r=stage.getBoundingClientRect(); s=Math.min(r.width/VW, r.height/VH)*0.94; tx=(r.width-VW*s)/2; ty=(r.height-VH*s)/2; apply();};
  const zoomAt=(f,cx,cy)=>{const ns=Math.min(6,Math.max(0.15,s*f)); tx=cx-(cx-tx)*(ns/s); ty=cy-(cy-ty)*(ns/s); s=ns; apply();};
  stage.addEventListener('wheel',e=>{e.preventDefault(); zoomAt(Math.exp(-e.deltaY*0.0015), e.clientX, e.clientY);},{passive:false});
  let drag=null;
  stage.addEventListener('pointerdown',e=>{drag={x:e.clientX-tx,y:e.clientY-ty}; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging');});
  stage.addEventListener('pointermove',e=>{if(!drag)return; tx=e.clientX-drag.x; ty=e.clientY-drag.y; apply();});
  stage.addEventListener('pointerup',()=>{drag=null; stage.classList.remove('dragging');});
  stage.addEventListener('dblclick',fit);
  document.querySelectorAll('#hud [data-z]').forEach(b=>b.onclick=()=>{const r=stage.getBoundingClientRect(); zoomAt(b.dataset.z>0?1.25:0.8, r.width/2, r.height/2);});
  document.getElementById('fit').onclick=fit;
  document.getElementById('reset').onclick=()=>{s=1; tx=24; ty=24; apply();};
  window.addEventListener('resize',fit); fit();
})();
</script></body></html>
"""

if __name__ == "__main__":
    svg = build_svg()
    (OUT / "pipeline.svg").write_text(svg, encoding="utf-8")
    page = (HTML.replace("__SVG__", svg).replace("__BG__", BG).replace("__INK__", INK).replace("__MUTED__", MUTED)
            .replace("__RULE__", RULE).replace("__FONT__", FONT).replace("__W__", str(W)).replace("__H__", str(H)))
    (OUT / "pipeline.html").write_text(page, encoding="utf-8")
    print("wrote", OUT / "pipeline.svg", "and pipeline.html", f"({len(svg)//1024} KB svg)")
