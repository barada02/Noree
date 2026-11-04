import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { LOCAL_ORIGIN } from "./actor";

/** Moves a caret position through a remote edit, so others typing doesn't move your cursor. */
function shiftThroughDelta(position: number, delta: Y.YTextEvent["delta"]): number {
  let index = 0;
  let result = position;
  for (const op of delta) {
    if (op.retain) index += op.retain;
    else if (typeof op.insert === "string") {
      if (index <= result) result += op.insert.length;
      index += op.insert.length;
    } else if (op.delete) {
      if (index < result) result -= Math.min(op.delete, result - index);
    }
  }
  return result;
}

type Props = { text: Y.Text; placeholder?: string; className?: string };

/** A plain textarea bound to a Y.Text. Local edits become the smallest insert and delete. */
export function YTextArea({ text, placeholder, className }: Props) {
  const [value, setValue] = useState(() => text.toString());
  const ref = useRef<HTMLTextAreaElement>(null);
  const restore = useRef<[number, number] | null>(null);

  useEffect(() => {
    const onChange = (event: Y.YTextEvent) => {
      const el = ref.current;
      if (el && event.transaction.origin !== LOCAL_ORIGIN && document.activeElement === el) {
        restore.current = [
          shiftThroughDelta(el.selectionStart, event.delta),
          shiftThroughDelta(el.selectionEnd, event.delta),
        ];
      }
      setValue(text.toString());
    };
    text.observe(onChange);
    return () => text.unobserve(onChange);
  }, [text]);

  useLayoutEffect(() => {
    if (restore.current && ref.current) {
      ref.current.setSelectionRange(restore.current[0], restore.current[1]);
      restore.current = null;
    }
  }, [value]);

  function onLocalChange(next: string) {
    const prev = text.toString();
    let start = 0;
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
    let endPrev = prev.length;
    let endNext = next.length;
    while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
      endPrev--;
      endNext--;
    }
    text.doc?.transact(() => {
      if (endPrev > start) text.delete(start, endPrev - start);
      if (endNext > start) text.insert(start, next.slice(start, endNext));
    }, LOCAL_ORIGIN);
    setValue(next);
  }

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onLocalChange(e.target.value)}
      className={`nodrag nowheel nopan h-full w-full resize-none bg-transparent outline-none ${className ?? ""}`}
    />
  );
}
