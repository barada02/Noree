const TYPES = [
  ["Y.Text", "Rich or plain text with formatting. Powers editors."],
  ["Y.Array", "An ordered list: blocks, rows, nodes."],
  ["Y.Map", "Key-value objects: a node's position, a block's props."],
  ["Y.XmlFragment", "Tree structures. Editor documents are stored this way."],
];

const PROVIDERS = [
  ["y-websocket", "Sync through a small server. The usual production choice."],
  ["y-webrtc", "Peer to peer in the browser. No server needed for sync."],
  ["y-indexeddb", "Saves the document locally so it works offline."],
];

const STEPS = [
  "Every change is a small binary update, tagged with who made it and in what order.",
  "Updates can arrive late, out of order or twice. Applying them in any order gives the same document.",
  "So two people (or a person and an agent) can edit at once, even offline, and everyone ends up identical. No central lock, no “your version is out of date”.",
];

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/20 py-12">
      <p className="font-mono text-xs tracking-widest uppercase text-white/50">
        {kicker}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function Yjs() {
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
            Concept
          </p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight md:text-7xl">
            Yjs
          </h1>
          <p className="mt-6 text-xl leading-8 text-white/80">
            A JavaScript library for building real-time collaboration. It keeps
            a shared document in sync between many people, devices and agents,
            without a server deciding who wins.
          </p>
        </div>

        <Section kicker="The problem" title="Two people edit the same line">
          <p className="leading-7 text-white/70">
            Classic apps send your edit to a server and hope nobody changed the
            same thing. When two edits collide, one is lost or you get a merge
            dialog. Real-time collaboration (think Google Docs, Figma) needs the
            edits themselves to be mergeable.
          </p>
        </Section>

        <Section kicker="The idea" title="CRDTs: data that always merges">
          <p className="leading-7 text-white/70">
            Yjs is built on a CRDT (conflict-free replicated data type).
          </p>
          <ol className="mt-5 space-y-4">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="font-mono text-sm text-white/40">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="leading-7 text-white/80">{s}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section kicker="Building blocks" title="Shared types">
          <p className="leading-7 text-white/70">
            You work with a <code className="font-mono">Y.Doc</code> that holds
            shared types. They look like normal data structures, but every
            change syncs.
          </p>
          <dl className="mt-5 divide-y divide-white/15 border-y border-white/15">
            {TYPES.map(([name, desc]) => (
              <div key={name} className="flex gap-4 py-3">
                <dt className="w-36 shrink-0 font-mono text-sm">{name}</dt>
                <dd className="text-sm leading-6 text-white/70">{desc}</dd>
              </div>
            ))}
          </dl>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-white/20 p-4 font-mono text-[13px] leading-6 text-white/90">
{`import * as Y from "yjs";

const doc = new Y.Doc();
const nodes = doc.getMap("nodes");

nodes.set("a", { x: 0, y: 0 });
doc.on("update", (u) => send(u)); // ship to peers
Y.applyUpdate(otherDoc, u);       // any order, same result`}
          </pre>
        </Section>

        <Section kicker="Moving data" title="Providers">
          <p className="leading-7 text-white/70">
            Yjs doesn't care how updates travel. Providers plug in the
            transport and storage.
          </p>
          <dl className="mt-5 divide-y divide-white/15 border-y border-white/15">
            {PROVIDERS.map(([name, desc]) => (
              <div key={name} className="flex gap-4 py-3">
                <dt className="w-36 shrink-0 font-mono text-sm">{name}</dt>
                <dd className="text-sm leading-6 text-white/70">{desc}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 leading-7 text-white/70">
            <span className="font-medium text-white">Awareness</span> is a
            separate light channel for temporary state: who is online, cursor
            positions, selections. It isn't saved in the document.
          </p>
        </Section>

        <Section kicker="Why it matters here" title="Agents as collaborators">
          <ul className="space-y-3 leading-7 text-white/80">
            <li>
              <span className="font-medium text-white">Editors.</span> BlockNote
              (the editor in this project) supports Yjs collaboration out of
              the box.
            </li>
            <li>
              <span className="font-medium text-white">Canvases.</span> A React
              Flow graph can live in a <code className="font-mono">Y.Map</code>{" "}
              so node moves sync live.
            </li>
            <li>
              <span className="font-medium text-white">Agents.</span> An AI
              agent can connect as another peer: it edits the same document,
              shows a cursor, and its changes merge and undo like anyone's.
            </li>
          </ul>
        </Section>

        <Section kicker="Trade-offs" title="Know before you adopt">
          <ul className="list-disc space-y-2 pl-5 leading-7 text-white/70">
            <li>
              Documents keep history metadata, so they grow over time (Yjs
              compacts well, but not to zero).
            </li>
            <li>
              Merging is automatic, not always what a human would pick. It never
              loses data, but it can interleave edits oddly.
            </li>
            <li>
              Needs a sync server for persistence and access control in a real
              app. Yjs itself provides neither.
            </li>
          </ul>
        </Section>

        <div className="flex flex-wrap gap-3 border-t border-white/20 pt-10">
          <a
            href="https://yjs.dev"
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-white px-5 py-2.5 text-sm font-medium text-black"
          >
            yjs.dev ↗
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
