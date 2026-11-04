import * as Y from "yjs";
import { docParts } from "../../../shared/schema.js";
import { YTextArea } from "../../doc/YTextArea";

type BlockProps = { doc: Y.Doc; id: string };

function TextContent({ doc, id, placeholder, className }: BlockProps & { placeholder: string; className: string }) {
  const text = docParts(doc).content.get(id)?.get("text");
  if (!(text instanceof Y.Text)) return null;
  // The key rebinds the field if the block's content is ever replaced.
  return <YTextArea key={id} text={text} placeholder={placeholder} className={className} />;
}

export function TextPreview(props: BlockProps) {
  return <TextContent {...props} placeholder="Write something" className="px-3 py-2 text-sm leading-6" />;
}

export function StickyPreview(props: BlockProps) {
  return <TextContent {...props} placeholder="Quick note" className="px-3 py-2 text-[15px] leading-6" />;
}
