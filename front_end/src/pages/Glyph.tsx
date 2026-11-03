const PROJECTS = [
  {
    name: "Glyph",
    tag: "Agent ↔ tool",
    summary:
      "Every tool publishes a signed “glyph card”: a self-describing contract covering what it does, what it costs and its input/output schemas.",
    points: [
      "The agent verifies the card (ed25519 signature) before calling the tool, instead of trusting a description blindly.",
      "Aimed at the same layer as MCP, but with signed, verifiable contracts.",
      "Open question raised by readers: what happens when a third-party tool publishes no card?",
    ],
    source: "Announced in a Reddit post; repo Monoperro0207/glyph-protocol. Test counts and package releases are the author's own claims.",
  },
  {
    name: "Ayni Protocol",
    tag: "Agent ↔ agent",
    summary:
      "A glyph-based language for agents to talk to each other: compact symbol codes plus structured metadata instead of full sentences.",
    points: [
      "About 28 glyphs for queries, responses, errors, actions and workflows, offered as 22 MCP tools.",
      "New glyphs are proposed by agents and voted on. An optional on-chain attestation layer runs on a testnet.",
      "Claims 50–70% fewer tokens per message. That figure is the project's own and unverified.",
    ],
    source: "Listed on mcpservers.org as sotoalt/ayni-protocol.",
  },
];

const COMPARE = [
  ["MCP", "Agent ↔ tool/data", "Mainstream. Introduced by Anthropic, widely adopted."],
  ["A2A", "Agent ↔ agent", "Mainstream. Introduced by Google, now under the Linux Foundation."],
  ["Glyph", "Agent ↔ tool", "Experimental. Adds signed contracts."],
  ["Ayni", "Agent ↔ agent", "Experimental. Adds a compact symbolic language."],
];

export default function Glyph() {
  return (
    <div className="min-h-screen bg-black text-white">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <a href="#/" className="text-lg font-semibold tracking-tight">
          Noree
        </a>
        <a
          href="#/"
          className="font-mono text-xs tracking-widest uppercase hover:underline"
        >
          ← Back
        </a>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-20">
        <div className="pt-14 pb-12">
          <p className="font-mono text-xs tracking-widest uppercase text-white/50">
            Concept · unverified
          </p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-7xl">
            Glyph protocols
          </h1>
          <p className="mt-6 text-xl leading-8 text-white/80">
            There is no single, established “Glyph Protocol”. The name is used
            by at least two separate early-stage projects that try to make AI
            agents safer or cheaper to coordinate.
          </p>
        </div>

        {PROJECTS.map((p) => (
          <section key={p.name} className="border-t border-white/20 py-12">
            <p className="font-mono text-xs tracking-widest uppercase text-white/50">
              {p.tag}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
              {p.name}
            </h2>
            <p className="mt-4 leading-7 text-white/80">{p.summary}</p>
            <ul className="mt-4 list-disc space-y-2 pl-5 leading-7 text-white/70">
              {p.points.map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
            <p className="mt-4 font-mono text-xs leading-5 text-white/40">
              {p.source}
            </p>
          </section>
        ))}

        <section className="border-t border-white/20 py-12">
          <p className="font-mono text-xs tracking-widest uppercase text-white/50">
            Context
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            Next to the mainstream protocols
          </h2>
          <dl className="mt-5 divide-y divide-white/15 border-y border-white/15">
            {COMPARE.map(([name, layer, note]) => (
              <div key={name} className="flex flex-wrap gap-x-4 gap-y-1 py-3">
                <dt className="w-16 shrink-0 font-mono text-sm">{name}</dt>
                <dd className="w-40 shrink-0 text-sm text-white/80">{layer}</dd>
                <dd className="min-w-0 flex-1 text-sm leading-6 text-white/60">
                  {note}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 leading-7 text-white/70">
            Neither Glyph project is backed by a standards body, and there's no
            sign of wide adoption yet. Worth watching, not worth building on.
          </p>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-white/20 pt-10">
          <a
            href="#/yjs"
            className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black"
          >
            What is Yjs?
          </a>
          <a
            href="#/experiments"
            className="rounded-md border border-white px-5 py-2.5 text-sm font-medium"
          >
            See experiments
          </a>
        </div>
      </main>
    </div>
  );
}
