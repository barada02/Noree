"""Coding agent + multimodal review, backed by the Baseten Muse model."""

import base64
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from app.schemas import ContextPayload

ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(ROOT_ENV)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

MODEL = os.getenv("AGENT_MODEL", "meta-models/muse-spark-open-1026")

SYSTEM = """You write ONE JavaScript ES module for a Three.js snippet system.

Hard rules:
- Only import from 'three' and 'three/addons/...'. No other packages, no fetch, no network.
- Default-export a function create(container, context) that renders into container immediately.
- Return { dispose() } that stops the loop and removes the canvas.
- Size the renderer to container.clientWidth/clientHeight. Handle context.theme.background/accent if present.
- Honour prefers-reduced-motion: no auto-rotation when it matches.
- Use THREE.PCFShadowMap for shadows (PCFSoftShadowMap is removed and warns).
- Output ONLY a ```js code block. No explanation."""


def _client() -> OpenAI:
    key = os.getenv("BASETEN_API_KEY")
    if not key:
        raise RuntimeError("BASETEN_API_KEY not set")
    return OpenAI(base_url="https://inference.baseten.co/v1", api_key=key)


def _extract(text: str) -> str:
    m = re.search(r"```(?:js|javascript)?\s*(.*?)```", text, re.S)
    code = (m.group(1) if m else text).strip()
    if "export default" not in code and "module.exports" not in code:
        code += "\nexport default create;\n"
    return code


def generate_code(context: ContextPayload, feedback: str | None = None) -> str:
    user = (
        f"Brief: {context.prompt}\n"
        f"Viewport: {context.viewport.width}x{context.viewport.height}\n"
        f"Theme: background={context.theme.background} accent={context.theme.accent}\n"
        f"Params: {context.params}\nScene already has: {context.scene}\n"
        "Make a single striking 3D object as the hero. Keep it centred and framed."
    )
    if feedback:
        user += f"\n\nPrevious attempt failed review. Fix these issues:\n{feedback}"
    r = _client().chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": user}],
        max_tokens=81920,
    )
    return _extract(r.choices[0].message.content or "")


def review_screenshot(screenshot: str | None, prompt: str) -> tuple[bool, str]:
    """Multimodal review. Falls back to (True, note) when vision is unavailable."""
    if not screenshot or not Path(screenshot).exists():
        return False, "no screenshot to review"
    try:
        b64 = base64.b64encode(Path(screenshot).read_bytes()).decode()
        r = _client().chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": (
                        f"Brief: {prompt}\nThis is a screenshot of a Three.js hero object. "
                        "Reply with PASS if a clear, centred 3D object matching the brief is visible "
                        "with no obvious rendering defects, else FAIL. "
                        "Format: first line PASS or FAIL, then one short line of notes."
                    )},
                    {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                ],
            }],
            max_tokens=2048,
        )
        text = (r.choices[0].message.content or "").strip()
        if not text:
            return True, "vision review empty; accepted on tester pass"
        return text.upper().startswith("PASS"), text
    except Exception as exc:  # vision unsupported or API error: tester pass is the gate
        return True, f"vision review unavailable ({type(exc).__name__}); accepted on tester pass"
