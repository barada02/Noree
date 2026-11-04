import { Suspense, lazy, useEffect, useState } from "react";
import Shell from "./components/Shell";
import Cam from "./pages/Cam";
import Camera from "./pages/Camera";
import Glyph from "./pages/Glyph";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Yjs from "./pages/Yjs";
import { ThemeProvider } from "./theme";
import { Mark } from "./noree/ui/Mark";

const BlockNoteExperiment = lazy(
  () => import("./experiments/blocknote/BlockNoteExperiment"),
);
const FlowExperiment = lazy(
  () => import("./experiments/reactflow/FlowExperiment"),
);
const NoreeApp = lazy(() => import("./noree/NoreeApp"));
const KonvaExperiment = lazy(
  () => import("./experiments/konva/KonvaExperiment"),
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

  // The product
  if (route === "app" || route.startsWith("p/")) {
    return (
      <ThemeProvider>
        <Suspense fallback={<div className="flex h-screen flex-col items-center justify-center gap-4" role="status" aria-label="Loading"><span className="animate-pulse"><Mark tile size={44} /></span><p className="text-sm text-stone-500">Loading…</p></div>}>
          <NoreeApp projectId={route === "app" ? null : route.slice(2)} />
        </Suspense>
      </ThemeProvider>
    );
  }

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

  if (route === "camera") {
    return (
      <ThemeProvider>
        <Camera />
      </ThemeProvider>
    );
  }
  if (route === "cam") {
    return (
      <ThemeProvider>
        <Cam />
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
        {route === "blocknote" || route === "reactflow" || route === "konva" ? (
          <Suspense
            fallback={
              <p className="px-6 py-10 font-mono text-sm text-stone-500">
                Loading experiment...
              </p>
            }
          >
            {route === "blocknote" ? (
              <BlockNoteExperiment />
            ) : route === "konva" ? (
              <KonvaExperiment />
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
