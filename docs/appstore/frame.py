# App Store screenshots: each raw app capture (1320x2868, from the Debug `-shots` walk) in a phone frame under a
# caption, at the 6.9" size App Store Connect asks for. Rendered with headless Chrome.
# usage: python3 -I frame.py <shots dir with <lang>/shot-*.png> <out dir>
import base64, json, os, subprocess, sys, tempfile, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
SHOTS, OUT = sys.argv[1], sys.argv[2]
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
ORDER = ['2-home', '3-session', '4-terminal', '5-changes', '1-pair']  # store order: the list first, pairing last
LANG = {'en-US': 'en', 'tr': 'tr', 'es-ES': 'es', 'pt-BR': 'pt-BR', 'de-DE': 'de', 'fr-FR': 'fr', 'ru': 'ru', 'zh-Hans': 'zh-Hans', 'ja': 'ja', 'ko': 'ko'}
W, H = 1320, 2868

PAGE = """<!doctype html><meta charset=utf-8><style>
html,body{margin:0;width:%(W)dpx;height:%(H)dpx;overflow:hidden;background:#0B0D10;
  font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','PingFang SC','Apple SD Gothic Neo',sans-serif}
.glow{position:absolute;left:50%%;top:1500px;width:1400px;height:1400px;transform:translate(-50%%,-50%%);
  background:radial-gradient(circle,rgba(200,255,46,.16),rgba(200,255,46,0) 62%%)}
.wrap{position:relative;display:flex;flex-direction:column;align-items:center;padding:170px 90px 0}
h1{margin:0;color:#F2F4F6;font-size:104px;line-height:1.1;font-weight:700;letter-spacing:0;text-align:center}
h1 b{color:#C8FF2E;font-weight:700}
p{margin:36px 20px 0;color:#A7B0B8;font-size:50px;line-height:1.3;text-align:center;font-weight:500}
.phone{margin-top:110px;width:1010px;flex-shrink:0;border-radius:150px;padding:22px;background:#1A1E23;
  box-shadow:0 0 0 4px #2A3038,0 60px 160px rgba(0,0,0,.7)}
.phone img{display:block;width:100%%;border-radius:128px}
</style><div class=glow></div><div class=wrap><h1>%(TITLE)s</h1><p>%(SUB)s</p>
<div class=phone><img src="data:image/png;base64,%(IMG)s"></div></div>"""

def render(html, out):
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False) as f:
        f.write(html)
    subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1',
                    f'--window-size={W},{H}', f'--screenshot={out}', f'file://{f.name}'], check=True, capture_output=True)
    os.unlink(f.name)

captions = json.load(open(os.path.join(HERE, 'captions.json')))
for locale, lang in LANG.items():
    os.makedirs(os.path.join(OUT, locale), exist_ok=True)
    for i, name in enumerate(ORDER):
        src = os.path.join(SHOTS, lang, f'shot-{name}.png')
        if not os.path.exists(src):
            print('missing', src); continue
        title, sub = (unicodedata.normalize('NFC', x) for x in captions[locale][i])
        img = base64.b64encode(open(src, 'rb').read()).decode()
        html = PAGE % dict(W=W, H=H, TITLE=title, SUB=sub, IMG=img)
        render(html, os.path.join(OUT, locale, f'{i + 1}.png'))
    print(locale, 'done')
