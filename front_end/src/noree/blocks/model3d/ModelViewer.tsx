import { useEffect, useMemo, useState } from "react";

const CODE_ASSET = /^\/api\/assets\/[a-f0-9]{48}\/[a-f0-9]{32}\.js$/;
const THREE_VERSION = "0.187.0";

/**
 * Generated code runs only in here: an iframe with no same-origin access, so it can't reach this
 * site, its cookies or the document. It loads the module the same way the sandbox test does.
 */
function pageFor(code: string) {
  const safeCode = code.replace(/<\/script/gi, "<\\/script");
  const context = JSON.stringify({ viewport: { width: 800, height: 600 }, theme: { background: "#0c0c0d", accent: "#e85d26" }, params: {}, scene: [], perfTier: "high" });
  return `<!doctype html>
<html><head><meta charset="utf-8">
<script type="importmap">
{"imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/"
}}
</script>
<style>html,body{margin:0;height:100%;background:#0c0c0d;overflow:hidden}#app{width:100%;height:100%}
#error{display:none;color:#f2f0eb;font:14px system-ui,sans-serif;padding:16px}</style>
</head><body><div id="app"></div><p id="error">This model couldn't be displayed.</p>
<script type="text/plain" id="code">${safeCode}</script>
<script type="module">
const fail = (e) => { console.error(e); document.getElementById('error').style.display = 'block'; };
try {
  const source = document.getElementById('code').textContent;
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const mod = await import(url);
  const create = mod.default || mod.create;
  if (typeof create !== 'function') throw new Error('The module has no create function.');
  window.__handle = create(document.getElementById('app'), ${context.replace(/</g, "\\u003c")});
} catch (e) { fail(e); }
</script></body></html>`;
}

export function ModelViewer({ codeAsset }: { codeAsset: string }) {
  const [result, setResult] = useState<{ asset: string; code: string | null } | null>(null);
  const valid = CODE_ASSET.test(codeAsset);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    fetch(codeAsset)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((code) => {
        if (!cancelled) setResult({ asset: codeAsset, code });
      })
      .catch(() => {
        if (!cancelled) setResult({ asset: codeAsset, code: null });
      });
    return () => {
      cancelled = true;
    };
  }, [codeAsset, valid]);

  const current = result?.asset === codeAsset ? result : null;
  const srcDoc = useMemo(() => (current?.code ? pageFor(current.code) : null), [current]);

  if (!valid || current?.code === null) {
    return <p className="flex h-full items-center justify-center p-4 text-center text-sm text-stone-300">This model couldn't be loaded. Check your connection and reopen it.</p>;
  }
  if (!srcDoc) {
    return <p className="flex h-full items-center justify-center font-mono text-xs tracking-widest text-stone-400 uppercase">Loading model</p>;
  }
  // The key restarts the scene when switching versions.
  return <iframe key={codeAsset} title="Generated 3D model" sandbox="allow-scripts" srcDoc={srcDoc} data-model-viewer className="h-full w-full border-0" />;
}
