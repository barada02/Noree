import { useEffect, useRef, useState } from "react";
import heroImage from "../../assets/brand/hero.webp";
import { localActor, renameLocalActor } from "../doc/actor";
import { startAgent } from "../lib/api";
import { greeting, relativeTime, tintFor } from "../lib/covers";
import { createProject, forgetProject, onProjectsChanged, projectHref, recentProjects } from "../lib/projects";
import { ProjectSidebar } from "../shell/ProjectSidebar";
import { ArrowRightIcon, CloseIcon, PlusIcon, SparkIcon } from "../ui/icons";
import { ProfileMenu } from "../ui/ProfileMenu";
import { NewProjectButton } from "../shell/NewProjectButton";

const IDEAS = ["Plan a launch for a coffee shop app", "Set up a study board on complex numbers", "Plan a three day trip to the mountains", "Turn meeting notes into next steps"];
const PROFILE_COLOR = "#2f7d5b";

/** The first words of what someone is planning, as the board's name. */
function titleFrom(text: string) {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const short = clean.length > 48 ? `${clean.slice(0, 48).replace(/\s+\S*$/, "")}…` : clean;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

export default function Home() {
  const [actor, setActor] = useState(localActor);
  const [projects, setProjects] = useState(recentProjects);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAnyway, setOpenAnyway] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const visibleProjects = projects
    .filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : b.openedAt - a.openedAt));

  useEffect(() => onProjectsChanged(() => setProjects(recentProjects())), []);

  async function start() {
    const text = idea.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setOpenAnyway(null);
    let id: string;
    try {
      id = await createProject(titleFrom(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the board.");
      setBusy(false);
      return;
    }
    try {
      await startAgent(id, { text, person: { id: actor.id, name: actor.name } });
    } catch (e) {
      // The board exists, so don't lose it: offer to open it empty.
      setError(`${e instanceof Error ? e.message : "The AI couldn't start."} The board was still created.`);
      setOpenAnyway(id);
      setBusy(false);
      return;
    }
    window.location.hash = projectHref(id);
  }

  return (
    <div className="noree-app flex h-screen w-screen overflow-hidden">
      <ProjectSidebar activeId={null} />
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-8 sm:pt-6">
          <div className="mb-4 flex justify-end">
            <ProfileMenu
              name={actor.name}
              color={PROFILE_COLOR}
              onRename={(name) => {
                renameLocalActor(name);
                setActor(localActor());
              }}
            />
          </div>

          <section className="relative isolate overflow-hidden rounded-[28px] border border-n-line-soft">
            <img src={heroImage} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover object-right dark:brightness-[0.5]" />
            <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(90deg, var(--n-bg) 0%, color-mix(in srgb, var(--n-bg) 90%, transparent) 40%, transparent 78%)" }} />
            <div className="n-rise max-w-xl px-6 py-10 sm:px-10 sm:py-14">
              <p className="n-hand text-[28px] leading-none text-n-moss">
                {greeting()}, {actor.name}
              </p>
              <h1 className="n-display mt-2 text-[40px] leading-[1.08] sm:text-[48px]">What are you planning?</h1>
              <p className="mt-3 max-w-md text-[16px] leading-7 text-n-ink-2">Describe it in a sentence. The AI will lay out a board for you, and you can change anything it builds.</p>
              <form
                className="mt-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void start();
                }}
              >
                <div className="n-panel flex items-end gap-2 p-2 pl-4 shadow-[var(--n-shadow-2)] focus-within:border-n-leaf">
                  <textarea
                    ref={ideaRef}
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void start();
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    aria-label="What are you planning?"
                    placeholder="A launch plan for my app, a study board for exams…"
                    className="min-h-12 flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 outline-none placeholder:text-n-ink-3"
                  />
                  <button type="submit" disabled={!idea.trim() || busy} className="n-btn n-btn--primary n-btn--lg shrink-0">
                    <SparkIcon />
                    {busy ? "Starting" : "Start a board"}
                  </button>
                </div>
              </form>
              {error && (
                <p role="alert" className="mt-3 text-sm text-n-danger">
                  {error}{" "}
                  {openAnyway && (
                    <a href={projectHref(openAnyway)} className="font-semibold underline">
                      Open it
                    </a>
                  )}
                </p>
              )}
              <ul className="mt-5 flex flex-wrap gap-2">
                {IDEAS.map((text) => (
                  <li key={text}>
                    <button type="button" onClick={() => { setIdea(text); ideaRef.current?.focus(); }} className="rounded-full border border-n-line bg-n-surface/80 px-3.5 py-2 text-[13px] text-n-ink-2 backdrop-blur transition-colors hover:border-n-leaf hover:bg-n-leaf-soft hover:text-n-moss">
                      {text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="mt-12">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 className="n-display text-[28px]">Your boards</h2>
              <p className="hidden text-sm text-n-ink-3 sm:block">Saved in this browser. Anyone with a board's link can open it.</p>
            </div>
            {projects.length > 0 && (
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" aria-label="Search your boards" placeholder="Search boards…" className="n-field !w-64 max-w-full" />
                <select value={sort} onChange={(e) => setSort(e.target.value as "recent" | "title")} aria-label="Sort boards" className="n-field !w-auto">
                  <option value="recent">Recently opened</option>
                  <option value="title">Title A–Z</option>
                </select>
                {query.trim() && <span className="text-sm text-n-ink-3" role="status">{visibleProjects.length} found</span>}
              </div>
            )}
            <div className="hidden">
            </div>
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              <li>
                <NewBoardCard />
              </li>
              {visibleProjects.map((p) => (
                <li key={p.id} className="group relative">
                  <a href={projectHref(p.id)} className="n-panel block overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[var(--n-shadow-2)]">
                    <span className="grid aspect-[3/2] w-full place-items-center" style={{ backgroundColor: tintFor(p.id) }} aria-hidden="true">
                      <span className="n-display text-[64px] text-white/95">{p.title.trim().slice(0, 1).toUpperCase() || "N"}</span>
                    </span>
                    <div className="px-4 py-3.5">
                      <h3 className="n-display truncate text-[19px]">{p.title}</h3>
                      <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-n-ink-3">
                        Opened {relativeTime(p.openedAt)}
                        <ArrowRightIcon className="ml-auto h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </p>
                    </div>
                  </a>
                  <button
                    type="button"
                    aria-label={`Remove ${p.title} from this list`}
                    title="Remove from this list. The board and its link keep working."
                    onClick={() => forgetProject(p.id)}
                    className="n-btn n-btn--icon n-btn--sm absolute top-3 right-3 bg-n-surface/90 text-n-ink-2 opacity-80 backdrop-blur group-hover:opacity-100 focus:opacity-100 lg:opacity-0"
                  >
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
            {projects.length === 0 && <p className="mt-6 max-w-md text-[15px] leading-6 text-n-ink-3">Nothing here yet. Describe an idea above, or start from a blank board.</p>}
            {projects.length > 0 && visibleProjects.length === 0 && <p className="mt-6 text-[15px] text-n-ink-3" role="status">No boards match “{query}”. Try a different search.</p>}
          </section>
        </div>
      </main>
    </div>
  );
}

function NewBoardCard() {
  return (
    <div className="grid aspect-[3/2.55] place-items-center rounded-[20px] border-[1.5px] border-dashed border-n-line bg-n-surface/50 p-4 text-center">
      <div>
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-n-leaf-soft text-n-moss">
          <PlusIcon className="h-5 w-5" />
        </span>
        <p className="n-display mt-3 text-[18px]">A blank board</p>
        <p className="mt-1 mb-4 text-[13px] text-n-ink-3">Start empty and add blocks yourself.</p>
        <NewProjectButton label="Create a blank board" showPlus={false} className="n-btn n-btn--outline n-btn--sm" />
      </div>
    </div>
  );
}
