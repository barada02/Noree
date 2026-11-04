from pathlib import Path

from app.modal_tester import test_snippet
from app.schemas import ContextPayload

code = Path("probes/sample_snippet.js").read_text()
ctx = ContextPayload(prompt="copper torus knot", viewport={"width": 800, "height": 600})
result = test_snippet(code, ctx)
print("passed:", result.passed)
print("screenshot:", result.screenshot)
print("error:", result.error)
for line in result.console[:20]:
    print("console:", line)
print("PROBE_OK")
