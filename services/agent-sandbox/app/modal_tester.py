"""Modal Sandbox tester: run one Three.js snippet, return screenshot + console.

Creates a Modal Sandbox with a headless Chromium, writes the snippet and a
fixed test page into it, screenshots the canvas, and reports pass/fail.
The sandbox is always terminated. See CONTRACT.md section 3.
"""

import base64
import json
import uuid
from pathlib import Path

import modal

from app.schemas import ContextPayload, TestResult

ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
THREE_VERSION = "0.187.0"

TEST_PAGE = """<!doctype html>
<html><head><meta charset="utf-8">
<script type="importmap">
{"imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@__V__/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@__V__/examples/jsm/"
}}
</script>
<style>html,body{margin:0;background:#0c0c0d}#app{width:800px;height:600px}</style>
</head><body><div id="app"></div>
<script type="module">
window.__errors = [];
window.addEventListener('error', e => window.__errors.push(String(e.message)));
try {
  const ctx = await fetch('./context.json').then(r => r.json()).catch(() => ({}));
  const mod = await import('./snippet.js');
  const create = mod.default || mod.create;
  window.__handle = create(document.getElementById('app'), ctx);
  window.__ready = true;
} catch (e) {
  window.__errors.push(String(e && e.stack || e));
  console.error(e);
}
</script></body></html>
"""

RUNNER = """
import functools
import http.server
import json
import threading
from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory="/tmp/work")
server = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()

logs = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(args=[
        "--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
    ])
    page = browser.new_page(viewport={"width": 800, "height": 600})
    page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
    page.goto("http://127.0.0.1:8765/index.html")
    page.wait_for_timeout(3500)
    errors = page.evaluate("window.__errors || []")
    ready = page.evaluate("window.__ready || false")
    page.screenshot(path="/tmp/work/shot.png")
    browser.close()

img = Image.open("/tmp/work/shot.png").convert("RGB")
stat = ImageStat.Stat(img)
colors = img.getcolors(maxcolors=1_000_000)
result = {
    "ready": ready,
    "errors": errors,
    "console": logs,
    "unique_colors": len(colors) if colors else 9999,
    "stddev": sum(stat.stddev) / 3.0,
}
print("RESULT:" + json.dumps(result))
"""


def _image() -> modal.Image:
    return (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install("playwright", "pillow")
        .run_commands("playwright install --with-deps chromium", "mkdir -p /tmp/work")
    )


def _write(sb: modal.Sandbox, name: str, content: str) -> None:
    b64 = base64.b64encode(content.encode()).decode()
    p = sb.exec(
        "python3", "-c",
        f"import base64,pathlib; pathlib.Path('/tmp/work/{name}').write_bytes(base64.b64decode('{b64}'))",
    )
    p.wait()
    if p.returncode != 0:
        raise RuntimeError(f"write {name} failed: {p.stderr.read()}")


def test_snippet(code: str, context: ContextPayload) -> TestResult:
    run_id = uuid.uuid4().hex[:12]
    app = modal.App.lookup("agent-sandbox", create_if_missing=True)
    sb = modal.Sandbox.create(app=app, image=_image(), timeout=600)
    try:
        _write(sb, "snippet.js", code)
        _write(sb, "context.json", context.model_dump_json())
        _write(sb, "index.html", TEST_PAGE.replace("__V__", THREE_VERSION))
        _write(sb, "runner.py", RUNNER)

        p = sb.exec("python3", "/tmp/work/runner.py", timeout=300)
        out = p.stdout.read()
        p.wait()
        if p.returncode != 0:
            return TestResult(passed=False, error=f"runner failed: {p.stderr.read()}"[-2000:])

        line = next((ln for ln in out.splitlines() if ln.startswith("RESULT:")), None)
        if not line:
            return TestResult(passed=False, error=f"no result in output: {out[-1000:]}")
        data = json.loads(line[len("RESULT:"):])

        shot_path = None
        b = sb.exec("base64", "-w", "0", "/tmp/work/shot.png")
        b64 = b.stdout.read().strip()
        b.wait()
        if b.returncode == 0 and b64:
            out_dir = ARTIFACTS / run_id
            out_dir.mkdir(parents=True, exist_ok=True)
            shot = out_dir / "shot.png"
            shot.write_bytes(base64.b64decode(b64))
            shot_path = str(shot)

        console = list(data.get("console", [])) + [f"error: {e}" for e in data.get("errors", [])]
        has_error = any(
            ln.startswith(("error:", "pageerror:")) or "error: " in ln[:12] for ln in console
        ) or bool(data.get("errors"))
        non_blank = data.get("unique_colors", 0) > 50 and data.get("stddev", 0) > 5
        passed = bool(data.get("ready")) and not has_error and non_blank
        return TestResult(passed=passed, screenshot=shot_path, console=console)
    finally:
        sb.terminate()
