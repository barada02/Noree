/**
 * Models sometimes over-escape LaTeX, writing \\pi where they mean \pi. To LaTeX that's a line break
 * followed by the letters "pi", so math renders as broken lines of plain words. A real line break is
 * followed by a space, a digit or the next row, not directly by a command name, so this is safe.
 */
export function repairLatex(source: string): string {
  return source.replace(/\\\\(?=[a-zA-Z])/g, '\\');
}
