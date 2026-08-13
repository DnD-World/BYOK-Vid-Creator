import base64, urllib.parse, os, sys

S = os.path.dirname(os.path.abspath(__file__))
bg = base64.b64encode(open(os.path.join(S, "bg.png"), "rb").read()).decode()

VARIANTS = [
    ("A current",       dict(ew=0.30, d=-110, blur=16, flat=0.93, g=16, b=32)),
    ("B sharp inner",   dict(ew=0.30, d=-110, blur=6,  flat=1.00, g=16, b=32)),
    ("C thick + gentle",dict(ew=0.45, d=-70,  blur=5,  flat=1.00, g=22, b=44)),
    ("D big chroma",    dict(ew=0.32, d=-120, blur=7,  flat=1.00, g=34, b=68)),
]

SIZE = 372
DISC = SIZE - 40


def dmap(w, h, r, ew, blur, brightness, flat):
    edge = min(w, h) * (ew * 0.5)
    svg = (
        '<svg viewBox="0 0 %d %d" xmlns="http://www.w3.org/2000/svg">'
        '<defs>'
        '<linearGradient id="r" x1="100%%" y1="0%%" x2="0%%" y2="0%%">'
        '<stop offset="0%%" stop-color="#0000"/><stop offset="100%%" stop-color="red"/></linearGradient>'
        '<linearGradient id="b" x1="0%%" y1="0%%" x2="0%%" y2="100%%">'
        '<stop offset="0%%" stop-color="#0000"/><stop offset="100%%" stop-color="blue"/></linearGradient>'
        '</defs>'
        '<rect width="%d" height="%d" fill="black"/>'
        '<rect width="%d" height="%d" rx="%f" fill="url(#r)"/>'
        '<rect width="%d" height="%d" rx="%f" fill="url(#b)" style="mix-blend-mode:difference"/>'
        '<rect x="%f" y="%f" width="%f" height="%f" rx="%f" fill="hsl(0 0%% %d%% / %s)" style="filter:blur(%fpx)"/>'
        '</svg>'
    ) % (w, h, w, h, w, h, r, w, h, r, edge, edge, w - edge * 2, h - edge * 2, r, brightness, flat, blur)
    return "data:image/svg+xml," + urllib.parse.quote(svg)


KEEP = {
    "r": "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
    "g": "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
    "b": "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
}

defs, cells = [], []
for i, (name, v) in enumerate(VARIANTS):
    fid = "f%d" % i
    m = dmap(DISC, DISC, DISC / 2.0, v["ew"], v["blur"], 50, v["flat"])
    defs.append(
        '<filter id="%s" colorInterpolationFilters="sRGB" x="0%%" y="0%%" width="100%%" height="100%%">'
        '<feImage href="%s" x="0" y="0" width="100%%" height="100%%" preserveAspectRatio="none" result="map"/>'
        '<feDisplacementMap in="SourceGraphic" in2="map" scale="%d" xChannelSelector="R" yChannelSelector="G" result="dR"/>'
        '<feColorMatrix in="dR" type="matrix" values="%s" result="oR"/>'
        '<feDisplacementMap in="SourceGraphic" in2="map" scale="%d" xChannelSelector="R" yChannelSelector="G" result="dG"/>'
        '<feColorMatrix in="dG" type="matrix" values="%s" result="oG"/>'
        '<feDisplacementMap in="SourceGraphic" in2="map" scale="%d" xChannelSelector="R" yChannelSelector="G" result="dB"/>'
        '<feColorMatrix in="dB" type="matrix" values="%s" result="oB"/>'
        '<feBlend in="oR" in2="oG" mode="screen" result="rg"/>'
        '<feBlend in="rg" in2="oB" mode="screen" result="rgb"/>'
        '<feGaussianBlur in="rgb" stdDeviation="0.7"/>'
        '</filter>'
        % (fid, m, v["d"], KEEP["r"], v["d"] + v["g"], KEEP["g"], v["d"] + v["b"], KEEP["b"])
    )
    cells.append(
        '<div class="cell"><div class="disc" style="backdrop-filter:url(#%s) saturate(1.1);'
        '-webkit-backdrop-filter:url(#%s) saturate(1.1)"></div>'
        '<span><b>%s</b><br>ew %s &middot; d %s &middot; blur %s &middot; flat %s &middot; %s/%s</span></div>'
        % (fid, fid, name, v["ew"], v["d"], v["blur"], v["flat"], v["g"], v["b"])
    )

html = (
    '<!doctype html><meta charset="utf-8"><style>'
    'body{margin:0;background:#111;font:13px system-ui;color:#eee}'
    '.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:5px;padding:5px}'
    '.cell{position:relative;height:%dpx;overflow:hidden;'
    'background:repeating-linear-gradient(135deg,#f4f4f4 0 26px,#111 26px 52px),'
    'linear-gradient(90deg,#ff3b30,#ff9500,#ffcc00,#34c759,#00c7be,#007aff,#af52de);'
    'background-blend-mode:multiply}'
    '.cell::after{content:"GLASS";position:absolute;inset:0;display:grid;place-items:center;'
    'font:900 96px system-ui;color:#fff;-webkit-text-stroke:3px #000;letter-spacing:.06em}'
    '.disc{position:absolute;left:50%%;top:50%%;transform:translate(-50%%,-50%%);width:%dpx;height:%dpx;'
    'z-index:2;border-radius:50%%;box-shadow:inset 0 0 2px 1px rgba(255,255,255,.35), inset 0 0 10px 4px rgba(255,255,255,.15)}'
    'span{position:absolute;left:4px;bottom:2px;background:#000c;padding:2px 4px;line-height:1.3}'
    '</style><svg width="0" height="0"><defs>%s</defs></svg>'
    '<div class="grid">%s</div>'
) % (SIZE, DISC, DISC, "".join(defs), "".join(cells))

out = os.path.join(S, "glass-lab.html")
open(out, "w", encoding="utf-8").write(html)
print("wrote", out, len(html) // 1024, "KB")
