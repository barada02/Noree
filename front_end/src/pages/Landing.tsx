import "../brand-fonts";
import "../noree/noree.css";
import { BRAND } from "../brand";
import heroImage from "../assets/brand/hero.png";
import shadowsImage from "../assets/brand/shadows.webp";
import shotAi from "../assets/brand/shot-ai.webp";
import shotBoard from "../assets/brand/shot-board.webp";
import {
  ArrowRightIcon,
  CubeIcon,
  PenIcon,
  SparkIcon,
} from "../noree/ui/icons";
import { Mark, Wordmark } from "../noree/ui/Mark";

const STEPS = [
  {
    icon: SparkIcon,
    title: "Say what you're planning",
    body: "One sentence is enough. The AI lays out frames, notes and checklists so you start with a board, not a blank page.",
  },
  {
    icon: PenIcon,
    title: "Work on it together",
    body: "Everyone on the link edits the same board live. The AI is another collaborator: you see it work, and can undo what it did.",
  },
  {
    icon: CubeIcon,
    title: "Let specialists build the hard parts",
    body: "Ask for a worked maths slate or a 3D model. A specialist agent builds it right on the board and shows its work.",
  },
];

const LAB = [
  { href: "#/blocknote", label: "Editor" },
  { href: "#/reactflow", label: "Canvas" },
  { href: "#/yjs", label: "Shared state" },
  { href: "#/glyph", label: "Glyph" },
  { href: "#/camera", label: "Phone camera" },
  { href: "#/experiments", label: "All experiments" },
];

/** The site routes on the hash, so in-page links scroll instead of changing it. */
function scrollTo(id: string) {
  document
    .getElementById(id)
    ?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
}

export default function Landing() {
  return (
    <div className="noree-site">
      <header className="flex w-full items-center justify-between px-5 py-5 sm:px-10">
        <a
          href="#/"
          aria-label={`${BRAND.name} home`}
          className="flex items-center gap-2.5"
        >
          <Mark tile size={32} />
          <Wordmark />
        </a>
        <nav aria-label="Site" className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => scrollTo("how")}
            className="n-btn n-btn--ghost hidden sm:inline-flex"
          >
            How it works
          </button>
          <button
            type="button"
            onClick={() => scrollTo("lab")}
            className="n-btn n-btn--ghost hidden sm:inline-flex"
          >
            Lab
          </button>
          <a href="#/app" className="n-btn n-btn--primary">
            Open the app
          </a>
        </nav>
      </header>

      <main>
        <section>
          <div className="relative isolate flex min-h-[540px] items-center overflow-hidden sm:min-h-[620px]">
            <img
              src={heroImage}
              alt=""
              className="absolute inset-0 -z-20 h-full w-full object-cover object-right dark:brightness-[0.5]"
            />
            <div
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "linear-gradient(90deg, var(--n-bg) 0%, color-mix(in srgb, var(--n-bg) 88%, transparent) 45%, transparent 85%)",
              }}
            />
            <div className="absolute inset-0 -z-10 bg-n-bg/70 sm:hidden" />
            <div className="n-rise mx-auto w-full max-w-6xl px-5 py-14 sm:px-8 sm:py-24">
              <p className="n-hand text-[28px] leading-none text-n-moss">
                {BRAND.tagline}
              </p>
              <h1 className="n-display mt-3 max-w-2xl text-[44px] leading-[1.04] sm:text-[64px]">
                A calm place to plan, draw and build with AI.
              </h1>
              <p className="mt-5 max-w-lg text-[17px] leading-8 text-n-ink-2">
                {BRAND.name} is a shared board. You and your team write, sketch
                and organise on it, and an AI works on the same board beside
                you, where you can see what it does.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#/app" className="n-btn n-btn--primary n-btn--lg">
                  Start a board
                  <ArrowRightIcon />
                </a>
                <button
                  type="button"
                  onClick={() => scrollTo("how")}
                  className="n-btn n-btn--outline n-btn--lg"
                >
                  See how it works
                </button>
              </div>
              <p className="mt-4 text-sm text-n-ink-3">
                No sign-up. Share a link and anyone can join.
              </p>
            </div>
          </div>
        </section>

        <section>
          <figure className="border-y border-n-line-soft bg-n-surface">
            <div className="overflow-hidden">
              <img
                src={shotBoard}
                alt="A board with three frames, Build, Launch and Feedback, each holding a checklist and a yellow risk note"
                width={1600}
                height={310}
                className="h-auto w-full"
              />
            </div>
            <figcaption className="mx-auto w-full max-w-6xl px-5 pt-3 pb-4 text-[13px] text-n-ink-3 sm:px-8">
              A board the AI laid out from one sentence: three frames, each with
              a checklist and its biggest risk.
            </figcaption>
          </figure>
        </section>

        <section
          id="how"
          className="mx-auto max-w-6xl scroll-mt-6 px-5 pt-20 sm:px-8 sm:pt-28"
        >
          <p className="n-eyebrow">How it works</p>
          <h2 className="n-display mt-2 max-w-2xl text-[34px] leading-[1.1] sm:text-[44px]">
            Three things, and nothing to set up.
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="n-panel p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-n-leaf-soft text-n-moss">
                  <s.icon className="h-5 w-5" />
                </span>
                <p className="n-eyebrow mt-5">Step {i + 1}</p>
                <h3 className="n-display mt-1 text-[22px] leading-tight">
                  {s.title}
                </h3>
                <p className="mt-2 text-[15px] leading-7 text-n-ink-2">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20 border-y border-n-line-soft bg-n-surface py-20 sm:mt-28 sm:py-24">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 sm:px-8 md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px]">
            <div>
              <p className="n-eyebrow">The AI, in the open</p>
              <h2 className="n-display mt-2 text-[34px] leading-[1.1] sm:text-[44px]">
                It tells you what it did, and you can take it back.
              </h2>
              <p className="mt-5 max-w-xl text-[16px] leading-8 text-n-ink-2">
                Every change the AI makes lands on the board like anyone else's.
                A short list shows what it added, and one button undoes the
                whole run. Select any block to talk about just that block.
              </p>
              <ul className="mt-6 space-y-3 text-[15px] text-n-ink-2">
                {[
                  "Works on the same board, live, with everyone watching",
                  "A plain list of what it changed, with one-click undo",
                  "Ask about a single block, or the whole board",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-n-leaf" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <figure className="n-panel overflow-hidden p-2 shadow-[var(--n-shadow-2)]">
              <img
                src={shotAi}
                alt="The AI panel: a request, the AI's reply, an Undo these changes button and a What it did list"
                width={690}
                height={780}
                className="w-full rounded-[14px]"
              />
            </figure>
          </div>
        </section>

        <section className="pt-20 sm:pt-28">
          <div className="relative isolate overflow-hidden">
            <img
              src={shadowsImage}
              alt=""
              className="absolute inset-0 -z-20 h-full w-full object-cover dark:brightness-[0.45]"
            />
            <div className="absolute inset-0 -z-10 bg-n-bg/55 dark:bg-n-bg/35" />
            <div className="mx-auto w-full max-w-6xl px-5 py-16 text-center sm:px-8 sm:py-24">
              <h2 className="n-display mx-auto max-w-2xl text-[34px] leading-[1.1] sm:text-[46px]">
                Start with one sentence.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[16px] leading-7 text-n-ink-2">
                Your board is ready in a few seconds. Share the link when you
                want company.
              </p>
              <a href="#/app" className="n-btn n-btn--primary n-btn--lg mt-8">
                Open {BRAND.name}
                <ArrowRightIcon />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer
        id="lab"
        className="mt-20 w-full scroll-mt-6 border-t border-n-line-soft pt-8 pb-12"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 sm:px-8 md:flex-row md:items-start md:justify-between">
          <div>
            <a href="#/" className="flex items-center gap-2.5">
              <Mark tile size={26} />
              <Wordmark className="text-[19px]" />
            </a>
            <p className="mt-3 max-w-xs text-[13px] leading-6 text-n-ink-3">
              {BRAND.description} Imagery generated with Muse Image.
            </p>
          </div>
          <div>
            <p className="n-eyebrow">Lab</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-n-ink-2 md:max-w-md">
              {LAB.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="underline-offset-4 hover:text-n-moss hover:underline"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 max-w-md text-[12.5px] leading-5 text-n-ink-3">
              The lab holds the early experiments this grew out of.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
