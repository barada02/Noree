// Tiny, safe math-expression compiler shared by the server (validation) and the web client (plotting).
// No eval/Function: a recursive-descent parser that builds closures.

export type Vars = Record<string, number>
export type Compiled = { ok: true; fn: (vars: Vars) => number } | { ok: false; error: string }

const FUNCS: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, ln: Math.log, log: Math.log10,
  floor: Math.floor, ceil: Math.ceil, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow, atan2: Math.atan2,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }
const NAMES = [...Object.keys(FUNCS), ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length)

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const s = src.replace(/×|·/g, '*').replace(/−/g, '-').replace(/π/g, 'pi').replace(/\*\*/g, '^')
  const out: Tok[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) { i++; continue }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i))
    if (num) { out.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue }
    if (/[A-Za-z]/.test(ch)) {
      const rest = s.slice(i).toLowerCase()
      const known = NAMES.find((n) => rest.startsWith(n))
      if (known) { out.push({ t: 'id', v: known }); i += known.length } else { out.push({ t: 'id', v: ch }); i++ }
      continue
    }
    if ('+-*/^(),'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; continue }
    throw new Error(`Unexpected character "${ch}"`)
  }
  return out
}

type Node = (v: Vars) => number

export function compileExpr(src: string, allowed: string[]): Compiled {
  try {
    if (!src.trim()) throw new Error('Empty expression')
    if (src.length > 200) throw new Error('Expression too long')
    const toks = tokenize(src)
    let p = 0
    const peek = () => toks[p]
    const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v
    const startsPrimary = () => {
      const t = peek()
      return !!t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '('))
    }

    function expr(): Node {
      let l = term()
      while (isOp('+') || isOp('-')) {
        const op = (toks[p++] as { v: string }).v
        const r = term()
        const a = l
        l = op === '+' ? (v) => a(v) + r(v) : (v) => a(v) - r(v)
      }
      return l
    }
    function term(): Node {
      let l = unary()
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const op = (toks[p++] as { v: string }).v
          const r = unary()
          const a = l
          l = op === '*' ? (v) => a(v) * r(v) : (v) => a(v) / r(v)
        } else if (startsPrimary()) { // implicit multiplication: 2x, a x, 3(x+1)
          const r = unary()
          const a = l
          l = (v) => a(v) * r(v)
        } else return l
      }
    }
    function unary(): Node {
      if (isOp('-')) { p++; const a = unary(); return (v) => -a(v) }
      if (isOp('+')) { p++; return unary() }
      return power()
    }
    function power(): Node {
      const base = primary()
      if (isOp('^')) { p++; const e = unary(); return (v) => Math.pow(base(v), e(v)) }
      return base
    }
    function primary(): Node {
      const t = toks[p++]
      if (!t) throw new Error('Unexpected end of expression')
      if (t.t === 'num') { const n = t.v; return () => n }
      if (t.t === 'op') {
        if (t.v === '(') { const e = expr(); if (!isOp(')')) throw new Error('Missing ")"'); p++; return e }
        throw new Error(`Unexpected "${t.v}"`)
      }
      const name = t.v
      if (name in FUNCS) {
        const f = FUNCS[name]
        const args: Node[] = []
        if (isOp('(')) {
          p++
          if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()) } }
          if (!isOp(')')) throw new Error('Missing ")"')
          p++
        } else args.push(power())
        return (v) => f(...args.map((a) => a(v)))
      }
      if (name in CONSTS) { const c = CONSTS[name]; return () => c }
      if (!allowed.includes(name)) throw new Error(`Unknown variable "${name}". Allowed: ${allowed.join(', ') || '(none)'}`)
      return (v) => v[name]
    }

    const root = expr()
    if (p < toks.length) throw new Error(`Unexpected "${(toks[p] as { v: string | number }).v}"`)
    return { ok: true, fn: root }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
