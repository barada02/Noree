type WelcomeCardProps = {
  title?: string
  description?: string
}

function WelcomeCard({
  title = 'Tailwind is ready',
  description = 'Build polished interfaces with utility-first CSS and Vite.',
}: WelcomeCardProps) {
  return (
    <section className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-100 shadow-2xl">
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
        <span className="text-xl font-bold">N</span>
      </div>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        Noree
      </p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-4 leading-7 text-slate-400">{description}</p>
      <button
        type="button"
        className="mt-8 rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:ring-offset-2 focus:ring-offset-slate-900"
      >
        Start building
      </button>
    </section>
  )
}

export default WelcomeCard
