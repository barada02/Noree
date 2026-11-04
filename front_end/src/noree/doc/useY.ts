import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

/** A value read from shared types, recomputed whenever any of them changes. */
export function useYValue<T>(
  types: Y.AbstractType<never>[] | Y.AbstractType<unknown>[],
  read: () => T,
  isEqual: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
): T {
  const [value, setValue] = useState(read);
  const latest = useRef({ read, isEqual });
  useEffect(() => {
    latest.current = { read, isEqual };
  });

  useEffect(() => {
    const update = () => {
      const next = latest.current.read();
      setValue((prev) => (latest.current.isEqual(prev, next) ? prev : next));
    };
    update();
    const list = types as Y.AbstractType<unknown>[];
    for (const type of list) type.observeDeep(update);
    return () => {
      for (const type of list) type.unobserveDeep(update);
    };
    // The shared types are stable for the life of a document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, types);

  return value;
}
