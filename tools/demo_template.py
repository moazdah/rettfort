"""Leser og skriver malen som ligger innebygd i demo.html (Claude Design-bundle).

  python3 tools/demo_template.py extract ut.html   # skriv malen til fil
  python3 tools/demo_template.py embed inn.html    # legg redigert mal tilbake i demo.html
"""
import json, re, sys, pathlib
DEMO = pathlib.Path(__file__).resolve().parent.parent / 'demo.html'
PAT = re.compile(r'(<script type="__bundler/template"[^>]*>)(.*?)(</script>)', re.S)

def extract():
    return json.loads(PAT.search(DEMO.read_text()).group(2))

def embed(tpl):
    s = DEMO.read_text(); m = PAT.search(s)
    DEMO.write_text(s[:m.start(2)] + json.dumps(tpl, ensure_ascii=False).replace('</', '<\\/') + s[m.end(2):])

if __name__ == '__main__':
    cmd, path = sys.argv[1], pathlib.Path(sys.argv[2])
    if cmd == 'extract': path.write_text(extract())
    elif cmd == 'embed': embed(path.read_text())
