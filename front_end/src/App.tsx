import { Suspense, lazy, useEffect, useState } from "react";
import Shell from "./components/Shell";
import Glyph from "./pages/Glyph";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Yjs from "./pages/Yjs";
import { ThemeProvider } from "./theme";

const BlockNoteExperiment = lazy(
  () => import("./experiments/blocknote/BlockNoteExperiment"),
);
const FlowExperiment = lazy(
  () => import("./experiments/reactflow/FlowExperiment"),
);

function routeFromHash(): string {
  return window.location.hash.replace(/^#\/?/, "").split("?")[0];
}

function App() {
  const [route, setRoute] = useState(routeFromHash);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(routeFromHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Standalone pages (no experiment sidebar)
  if (route === "") {
    return (
      <ThemeProvider>
        <Landing />
      </ThemeProvider>
    );
  }
  if (route === "yjs") {
    return (
      <ThemeProvider>
        <Yjs />
      </ThemeProvider>
    );
  }

  if (route === "glyph") {
    return (
      <ThemeProvider>
        <Glyph />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <Shell route={route}>
        {route === "blocknote" || route === "reactflow" ? (
          <Suspense
            fallback={
              <p className="px-6 py-10 font-mono text-sm text-stone-500">
                Loading experiment…
              </p>
            }
          >
            {route === "blocknote" ? (
              <BlockNoteExperiment />
            ) : (
              <FlowExperiment />
            )}
          </Suspense>
        ) : (
          <Home />
        )}
      </Shell>
    </ThemeProvider>
  );
}

export default App;
