import { Suspense, lazy, useEffect, useState } from "react";
import Shell from "./components/Shell";
import Home from "./pages/Home";
import { ThemeProvider } from "./theme";

const BlockNoteExperiment = lazy(
  () => import("./experiments/blocknote/BlockNoteExperiment"),
);

function routeFromHash(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

function App() {
  const [route, setRoute] = useState(routeFromHash);

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <ThemeProvider>
      <Shell route={route}>
        {route === "blocknote" ? (
          <Suspense
            fallback={
              <p className="px-6 py-10 font-mono text-sm text-stone-500">
                Loading editor…
              </p>
            }
          >
            <BlockNoteExperiment />
          </Suspense>
        ) : (
          <Home />
        )}
      </Shell>
    </ThemeProvider>
  );
}

export default App;
