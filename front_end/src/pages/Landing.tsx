const FEATURES = [
  {
    kicker: "01 · Documents",
    title: "Docs that think with you",
    body: "Block-based pages where an agent drafts, restructures and cites alongside you — not in a chat box off to the side.",
    href: "#/blocknote",
    cta: "Open the editor",
  },
  {
    kicker: "02 · Flows",
    title: "Work as a graph",
    body: "Break a goal into nodes you can see, rewire and rerun. Every step an agent takes is something you can inspect.",
    href: "#/reactflow",
    cta: "Open the canvas",
  },
  {
    kicker: "03 · Shared state",
    title: "People and agents, one document",
    body: "Conflict-free shared state means an agent is just another collaborator: same cursor, same history, same undo.",
    href: "#/yjs",
    cta: "What is Yjs?",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-black dark:bg-black dark:text-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <a href="#/" className="text-lg font-semibold tracking-tight">
          Noree
        </a>
        <nav className="flex items-center gap-5 font-mono text-xs tracking-widest uppercase">
          <a href="#/yjs" className="hover:underline">
            Yjs
          </a>
          <a href="#/glyph" className="hover:underline">
            Glyph
          </a>
          <a href="#/camera" className="hover:underline">
            Camera
          </a>
          <a href="#/experiments" className="hover:underline">
            Experiments
          </a>
        </nav>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-16 pb-20 md:pt-28">
        <p className="font-mono text-xs tracking-widest uppercase opacity-60">
          Early prototype
        </p>
        <h1 className="mt-4 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight md:text-7xl">
          A new agentic way to interact and work with AI.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 opacity-70">
          Instead of prompting a chatbot and copying the answer out, you and AI
          agents work in the same documents and flows — visibly, together, in
          real time.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="#/blocknote"
            className="rounded-md bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            Try the editor
          </a>
          <a
            href="#/reactflow"
            className="rounded-md border border-black px-5 py-2.5 text-sm font-medium dark:border-white"
          >
            Try the canvas
          </a>
          <a
            href="#/camera"
            className="rounded-md border border-black px-5 py-2.5 text-sm font-medium dark:border-white"
          >
            Connect a phone camera
          </a>
        </div>

        {/* Static mock of the idea: a human and an agent in one doc */}
        <div className="mt-16 rounded-xl border border-black/15 p-5 md:p-8 dark:border-white/20">
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span className="rounded-full border border-black/30 px-2.5 py-0.5 dark:border-white/30">
              you
            </span>
            <span className="rounded-full bg-black px-2.5 py-0.5 text-white dark:bg-white dark:text-black">
              agent · editing…
            </span>
          </div>
          <p className="mt-5 text-xl font-semibold">Launch plan</p>
          <p className="mt-2 leading-7 opacity-80">
            Goal: ship the beta by the end of the month.
          </p>
          <p className="mt-2 leading-7">
            <span className="opacity-80">
              Risks: onboarding is the weakest step, and
            </span>
            <span className="ml-1 border-b-2 border-black pb-0.5 dark:border-white">
              the agent is drafting mitigations here
            </span>
            <span className="ml-0.5 inline-block h-5 w-0.5 translate-y-1 animate-pulse bg-black dark:bg-white" />
          </p>
        </div>
      </section>

      <section className="border-t border-black/15 dark:border-white/20">
        <div className="mx-auto grid max-w-5xl gap-px px-6 py-16 md:grid-cols-3">
          {FEATURES.map((f) => (
            <a
              key={f.title}
              href={f.href}
              className="group flex flex-col border border-black/15 p-6 transition-colors hover:bg-black hover:text-white md:-ml-px dark:border-white/20 dark:hover:bg-white dark:hover:text-black"
            >
              <span className="font-mono text-[11px] tracking-widest uppercase opacity-60">
                {f.kicker}
              </span>
              <span className="mt-4 text-xl font-semibold">{f.title}</span>
              <span className="mt-3 flex-1 text-sm leading-6 opacity-70">
                {f.body}
              </span>
              <span className="mt-6 text-sm font-medium">{f.cta} →</span>
            </a>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 pb-10 font-mono text-xs opacity-50">
        Noree · an experiment, not a product yet.
      </footer>
    </div>
  );
}
