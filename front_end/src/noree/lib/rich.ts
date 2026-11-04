import katex from 'katex'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Tiny renderer for text-box bodies: **bold**, "- " / "* " bullets, newlines, and $inline$ /
 * $$display$$ LaTeX. Math is pulled out first so bold/bullets can wrap it (e.g. **$z$**).
 */
export function renderRich(text: string): string {
  const math: string[] = []
  // Models sometimes use \( ... \) and \[ ... \] delimiters; normalise to $ ... $ and $$ ... $$.
  const normalised = text.replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$').replace(/\\\[([\s\S]+?)\\\]/g, '$$$$$1$$$$')
  const withTokens = normalised.replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (_m, display: string | undefined, inline: string | undefined) => {
    const src = display ?? inline ?? ''
    math.push(katex.renderToString(src, { throwOnError: false, displayMode: display !== undefined }))
    return `\u0000${math.length - 1}\u0000`
  })
  const html = esc(withTokens)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s+/, '• '))
    .join('<br/>')
  return html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => math[Number(i)])
}
