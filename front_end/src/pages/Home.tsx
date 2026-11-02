import { EXPERIMENTS } from "../experiments/registry";

export default function Home() {
  const live = EXPERIMENTS.filter((e) => e.status === "live");
  const soon = EXPERIMENTS.filter((e) => e.status === "soon");

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:py-16">
      <p className="font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
        {live.length} live · {soon.length} queued
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
        Experiments
      </h1>
      <p className="mt-2 max-w-xl text-[15px] leading-7 text-stone-600 dark:text-stone-400">
        A workbench for React-adjacent tech. Each experiment integrates one
        thing properly — and where it's feasible, we build our own version to
        compare.
      </p>

      <div className="mt-8 border-t border-stone-200 dark:border-stone-800">
        {live.map((e, i) => (
          <a
            key={e.id}
            href={e.route}
            className="group flex items-baseline gap-4 border-b border-stone-200 py-5 dark:border-stone-800"
          >
            <span className="font-mono text-sm text-stone-400 dark:text-stone-500">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span className="font-medium">{e.title}</span>
              </span>
              <span className="mt-1 block text-sm leading-6 text-stone-600 dark:text-stone-400">
                {e.tagline}
              </span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                  >
                    {t}
                  </span>
                ))}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="text-stone-400 transition-transform group-hover:translate-x-1 dark:text-stone-500"
            >
              →
            </span>
          </a>
        ))}
      </div>

      <h2 className="mt-10 font-mono text-xs tracking-widest text-stone-500 uppercase dark:text-stone-400">
        Queued up
      </h2>
      <div className="mt-3 space-y-3">
        {soon.map((e) => (
          <div
            key={e.id}
            className="rounded-lg border border-dashed border-stone-300 px-4 py-3 dark:border-stone-700"
          >
            <p className="text-sm font-medium text-stone-500 dark:text-stone-400">
              {e.title}
            </p>
            <p className="mt-0.5 text-sm text-stone-400 dark:text-stone-500">
              {e.tagline}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-lg bg-stone-100 px-4 py-3 font-mono text-xs leading-6 text-stone-600 dark:bg-stone-900 dark:text-stone-400">
        <p>add an experiment:</p>
        <p>1. create src/experiments/&lt;name&gt;/</p>
        <p>2. register it in src/experiments/registry.ts</p>
        <p>3. add its route in src/App.tsx</p>
      </div>
    </div>
  );
}
