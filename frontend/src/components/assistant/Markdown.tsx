import { Fragment } from "react";
import type { ReactNode } from "react";

/**
 * Minimal, dependency-free Markdown renderer for assistant answers: headings, paragraphs, ordered/unordered
 * lists, simple pipe tables, **bold**, *italic* and `inline code`. Text is rendered as React text nodes (never
 * innerHTML), so model output cannot inject markup. `[TOKEN]` citations are handed to `cite` for rendering.
 */
type Cite = (token: string, key: string) => ReactNode | null;

function inline(text: string, cite: Cite, kp: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]\n]{1,120}\])/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0], key = `${kp}-${n++}`;
    if (tok.startsWith("**")) out.push(<strong key={key} className="font-semibold text-fg">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-raised px-1 py-px font-mono text-[12px] text-fg">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) out.push(cite(tok.slice(1, -1), key) ?? tok);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text, cite, className = "" }: { text: string; cite: Cite; className?: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, b = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = `b${b++}`;
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push(<p key={k} className="mt-2 text-[14px] font-semibold text-fg">{inline(h[2], cite, k)}</p>); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      blocks.push(
        <div key={k} className="overflow-x-auto"><table className="w-full text-[13px]"><tbody>
          {rows.map((r, ri) => <tr key={ri} className="border-b border-line last:border-0">{r.map((c, ci) => { const C = ri === 0 ? "th" : "td"; return <C key={ci} className={`px-2 py-1.5 text-left align-top ${ri === 0 ? "font-semibold text-fg" : "text-muted"}`}>{inline(c, cite, `${k}-${ri}-${ci}`)}</C>; })}</tr>)}
        </tbody></table></div>,
      );
      continue;
    }
    const ul = /^\s*[-*•]\s+/, ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? ol : ul).test(lines[i])) { items.push(lines[i].replace(ordered ? ol : ul, "")); i++; }
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={k} className={`space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-subtle`}>{items.map((it, n) => <li key={n}>{inline(it, cite, `${k}-${n}`)}</li>)}</L>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !ul.test(lines[i]) && !ol.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={k}>{para.map((p, n) => <Fragment key={n}>{n > 0 && <br />}{inline(p, cite, `${k}-${n}`)}</Fragment>)}</p>);
  }
  return <div className={`space-y-3 ${className}`}>{blocks}</div>;
}
