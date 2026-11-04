import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Y from "yjs";

/**
 * Widget values (sliders, the dragged point) live in the page's shared map, keyed by widget id. So
 * everyone sees the same value, and the live label under the handwriting mirrors the widget. Same hook
 * signature as ink-agent, which is why the widgets themselves didn't need changing.
 */
type Store = {
  values: Record<string, unknown>;
  update: (id: string, initial: unknown, next: unknown) => void;
};

const Ctx = createContext<Store>({ values: {}, update: () => {} });

export function WidgetStateProvider({ map, children }: { map: Y.Map<unknown>; children: ReactNode }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => map.toJSON());

  useEffect(() => {
    const onChange = () => setValues(map.toJSON());
    onChange();
    map.observe(onChange);
    return () => map.unobserve(onChange);
  }, [map]);

  const update = useCallback<Store["update"]>(
    (id, initial, next) => {
      const prev = map.has(id) ? map.get(id) : initial;
      // No origin, so dragging a slider isn't an undo step.
      map.set(id, typeof next === "function" ? (next as (p: unknown) => unknown)(prev) : next);
    },
    [map],
  );

  const store = useMemo(() => ({ values, update }), [values, update]);
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useWidgetValue<T>(id: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const { values, update } = useContext(Ctx);
  const value = (id in values ? values[id] : initial) as T;
  const set = useCallback((next: T | ((prev: T) => T)) => update(id, initial, next), [update, id, initial]);
  return [value, set];
}
