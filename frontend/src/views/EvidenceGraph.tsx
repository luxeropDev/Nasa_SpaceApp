import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, List, Maximize2, Minus, Network, Plus, X } from "lucide-react";
import type { Graph, GraphNode, GraphNodeType } from "../api";
import { useGet, ErrorBox, Page, PageSkeleton, Segmented, SearchInput, Empty } from "../components/ui";
import { LinkKindBadge } from "../components/research/SourceLink";
import { useI18n } from "../i18n";
import { go, href } from "../nav";
import { DarkZone } from "../zone";
import { useChartTheme } from "../theme";

const TYPES: GraphNodeType[] = ["investigation", "dataset", "document", "source", "context", "research_domain", "safety_domain", "fuel", "scenario"];
/** Node types shown on first load: the research entities. Taxonomy nodes can be switched on from the filter. */
const DEFAULT_TYPES: GraphNodeType[] = ["investigation", "dataset", "document", "source", "context", "scenario"];
const W = 1100, H = 760;
type Pos = Record<string, { x: number; y: number }>;

/** Deterministic force-directed layout (no randomness, no library): repulsion + edge springs + centring. */
function layout(g: Graph): Pos {
  const n = g.nodes.length;
  const p: Pos = {};
  const ring: Record<GraphNodeType, number> = { investigation: 150, dataset: 230, document: 300, context: 320, source: 330, research_domain: 300, safety_domain: 310, fuel: 290, scenario: 320 };
  g.nodes.forEach((nd, i) => {
    const a = (i / n) * Math.PI * 2 + TYPES.indexOf(nd.type) * 0.7;
    p[nd.id] = { x: W / 2 + Math.cos(a) * ring[nd.type], y: H / 2 + Math.sin(a) * ring[nd.type] * 0.8 };
  });
  const ids = g.nodes.map((x) => x.id);
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 340;
    const f: Pos = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = p[ids[i]], b = p[ids[j]];
      let dx = a.x - b.x, dy = a.y - b.y;
      const d2 = Math.max(dx * dx + dy * dy, 25);
      const k = 5200 / d2;
      const d = Math.sqrt(d2); dx /= d; dy /= d;
      f[ids[i]].x += dx * k; f[ids[i]].y += dy * k; f[ids[j]].x -= dx * k; f[ids[j]].y -= dy * k;
    }
    for (const e of g.edges) {
      const a = p[e.source], b = p[e.target];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = e.type === "RELATED_TO" ? 70 : 115;
      const k = (d - rest) * 0.02;
      f[e.source].x += (dx / d) * k * d * 0.05; f[e.source].y += (dy / d) * k * d * 0.05;
      f[e.target].x -= (dx / d) * k * d * 0.05; f[e.target].y -= (dy / d) * k * d * 0.05;
    }
    for (const id of ids) {
      f[id].x += (W / 2 - p[id].x) * 0.012; f[id].y += (H / 2 - p[id].y) * 0.016;
      const m = Math.min(12, Math.hypot(f[id].x, f[id].y)) * cool;
      const len = Math.hypot(f[id].x, f[id].y) || 1;
      p[id].x = Math.max(30, Math.min(W - 30, p[id].x + (f[id].x / len) * m));
      p[id].y = Math.max(30, Math.min(H - 30, p[id].y + (f[id].y / len) * m));
    }
  }
  // fit the settled layout to the canvas (keeps aspect ratio, leaves room for labels)
  const xs = ids.map((id) => p[id].x), ys = ids.map((id) => p[id].y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  // axes are scaled independently (limited to 1.8× distortion) so the graph uses the wide canvas
  const m = 70;
  let sx = (W - 2 * m) / Math.max(1, x1 - x0), sy = (H - 2 * m) / Math.max(1, y1 - y0);
  sx = Math.min(sx, sy * 1.8); sy = Math.min(sy, sx * 1.8);
  const ox = (W - (x1 - x0) * sx) / 2, oy = (H - (y1 - y0) * sy) / 2;
  for (const id of ids) p[id] = { x: ox + (p[id].x - x0) * sx, y: oy + (p[id].y - y0) * sy };
  return p;
}

export default function EvidenceGraph({ params }: { params: URLSearchParams }) {
  const { t, tc } = useI18n();
  const ch = useChartTheme(true) /* canvas is always a dark plotting surface */;
  const g = useGet<Graph>("/graph");
  const [view, setView] = useState<"graph" | "list">("graph");
  const [types, setTypes] = useState<Set<GraphNodeType>>(() => new Set(DEFAULT_TYPES));
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(params.get("focus"));
  const [tf, setTf] = useState({ x: 0, y: 0, k: 1 });
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);

  const pos = useMemo(() => (g.data ? layout(g.data) : {}), [g.data]);
  const label = (n: GraphNode) => (n.type === "safety_domain" ? tc("sd", n.code ?? n.label) : n.type === "fuel" ? tc("fuel", n.code ?? n.label) : n.type === "scenario" ? tc("scen", n.code ?? n.label) : n.label);
  const nodes = useMemo(() => (g.data?.nodes ?? []).filter((n) => types.has(n.type)), [g.data, types]);
  const visible = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => (g.data?.edges ?? []).filter((e) => visible.has(e.source) && visible.has(e.target)), [g.data, visible]);
  const byId = useMemo(() => Object.fromEntries((g.data?.nodes ?? []).map((n) => [n.id, n])), [g.data]);
  const focusId = hover ?? sel;
  const neigh = useMemo(() => {
    if (!focusId) return null;
    const s = new Set([focusId]);
    edges.forEach((e) => { if (e.source === focusId) s.add(e.target); if (e.target === focusId) s.add(e.source); });
    return s;
  }, [focusId, edges]);
  const ql = q.trim().toLowerCase();
  const matches = useMemo(() => (ql ? new Set(nodes.filter((n) => label(n).toLowerCase().includes(ql) || n.id.toLowerCase().includes(ql) || (n.full_name ?? "").toLowerCase().includes(ql)).map((n) => n.id)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ql, nodes, tc]);

  // wheel zoom around the cursor (non-passive so the page does not scroll)
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * W, my = ((e.clientY - r.top) / r.height) * H;
      setTf((s) => { const k = Math.max(0.5, Math.min(3, s.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12))); return { k, x: mx - ((mx - s.x) * k) / s.k, y: my - ((my - s.y) * k) / s.k }; });
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [view, g.data]);

  const zoom = (f: number) => setTf((s) => { const k = Math.max(0.5, Math.min(3, s.k * f)); return { k, x: W / 2 - ((W / 2 - s.x) * k) / s.k, y: H / 2 - ((H / 2 - s.y) * k) / s.k }; });
  const toggleType = (ty: GraphNodeType) => setTypes((s) => { const n = new Set(s); if (n.has(ty)) { if (n.size > 1) n.delete(ty); } else n.add(ty); return n; });
  const selNode = sel ? byId[sel] : null;
  const conns = (id: string) => (g.data?.edges ?? []).filter((e) => e.source === id || e.target === id).map((e) => ({ e, other: byId[e.source === id ? e.target : e.source] }));
  const radius = (n: GraphNode) => (n.type === "investigation" ? 9 : 5) + Math.sqrt(n.degree) * 1.4;

  const wrap = (c: React.ReactNode) => <Page wide eyebrow={t("gr.eyebrow")} title={t("gr.title")} sub={t("gr.sub")}>{c}</Page>;
  if (g.error) return wrap(<ErrorBox error={g.error} retry={g.retry} />);
  if (!g.data) return wrap(<PageSkeleton />);
  const counts = Object.fromEntries(TYPES.map((ty) => [ty, g.data!.nodes.filter((n) => n.type === ty).length]));
  const edgeTypes = Array.from(new Set(g.data.edges.map((e) => e.type)));

  const details = selNode && (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="label flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: ch.node[selNode.type] }} />{t(`gr.type.${selNode.type}`)}</p>
          <h2 className="mt-1 break-words text-[16px] font-semibold text-fg">{label(selNode)}</h2>
          {selNode.full_name && <p className="text-[12.5px] text-muted">{selNode.full_name}</p>}
          <p className="mt-0.5 font-mono text-[10.5px] text-subtle">{selNode.id}</p>
        </div>
        <button className="icon-btn !h-8 !w-8" onClick={() => setSel(null)} aria-label={t("common.close")}><X size={15} /></button>
      </div>
      {selNode.type === "investigation" && <a className="btn btn-sm w-full" href={href("explorer", selNode.id)}>{t("gr.openRecord")}<ArrowRight size={13} /></a>}
      {selNode.type === "source" && selNode.url && <div className="space-y-2"><a className="btn btn-sm w-full" href={selNode.url} target="_blank" rel="noreferrer">{t("so.open")}</a>{selNode.link_kind && <LinkKindBadge kind={selNode.link_kind} />}</div>}
      {(selNode.type === "dataset" || selNode.type === "document") && selNode.url && <a className="btn btn-sm w-full" href={selNode.url} target="_blank" rel="noreferrer">{selNode.type === "dataset" ? t("v4.ds.openPsi") : t("v4.doc.open")}</a>}
      {selNode.doi && <p className="font-mono text-[11px] text-muted">DOI <a className="text-accent hover:underline" href={`https://doi.org/${selNode.doi}`} target="_blank" rel="noreferrer">{selNode.doi}</a></p>}
      {selNode.type === "context" && <p className="rounded-ctl border border-warn/30 bg-warn/[.06] p-2.5 text-[12px] leading-relaxed text-muted">{t("v4.ctx.notEvidence")}</p>}
      {selNode.type === "scenario" && <a className="btn btn-sm w-full" href={href("scenarios", null, { s: selNode.code ?? "" })}>{t("gr.openScenario")}<ArrowRight size={13} /></a>}
      <div>
        <p className="label mb-2">{t("gr.connections", { n: conns(selNode.id).length })}</p>
        <ul className="space-y-1">{conns(selNode.id).map(({ e, other }, k) => other && (
          <li key={k}><button className="flex w-full items-center gap-2 rounded-ctl px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-hover" onClick={() => setSel(other.id)}>
            <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: ch.node[other.type] }} />
            <span className="min-w-0 flex-1 truncate text-fg">{label(other)}</span>
            <span className="shrink-0 text-right font-mono text-[9.5px] leading-tight text-subtle">{e.type}<span className="block text-[9px]">{t(`v4.origin.${e.origin}`)}</span></span>
          </button>{e.basis && e.type === "MENTIONED_IN" && <p className="px-2 pb-1 font-mono text-[10px] text-subtle">{e.basis}</p>}</li>))}</ul>
      </div>
    </div>
  );

  return (
    <Page wide eyebrow={t("gr.eyebrow")} title={t("gr.title")} sub={t("gr.sub")}
      actions={<Segmented label={t("gr.view")} value={view} onChange={setView} options={[{ value: "graph", label: t("gr.view.graph"), icon: Network }, { value: "list", label: t("gr.view.list"), icon: List }]} />}>
      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <SearchInput id="gr-q" className="w-full sm:w-64" value={q} onChange={setQ} placeholder={t("gr.search")} label={t("gr.search")}
          onKeyDown={(e) => { if (e.key === "Enter" && matches && matches.size) setSel(Array.from(matches)[0]); }} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("gr.filter")}>
          {TYPES.map((ty) => (
            <button key={ty} type="button" aria-pressed={types.has(ty)} onClick={() => toggleType(ty)}
              className={`chip transition-colors ${types.has(ty) ? "!border-line-strong !text-fg" : "opacity-50 hover:opacity-80"}`}>
              <i className="h-2 w-2 rounded-full" style={{ background: ch.node[ty] }} aria-hidden="true" />{t(`gr.type.${ty}`)}<span className="font-mono text-subtle">{counts[ty]}</span>
            </button>
          ))}
        </div>
      </div>

      {view === "graph" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <DarkZone className="relative overflow-hidden rounded-card border border-line bg-bg2">
            <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="block h-[56vh] min-h-[380px] w-full cursor-grab touch-none select-none active:cursor-grabbing" role="group" aria-label={t("gr.canvas")}
              onPointerDown={(e) => { if ((e.target as Element).closest("[data-node]")) return; drag.current = { x: e.clientX, y: e.clientY, tx: tf.x, ty: tf.y, moved: false }; (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
              onPointerMove={(e) => {
                const d = drag.current; if (!d || !svg.current) return;
                const r = svg.current.getBoundingClientRect(); const sx = W / r.width, sy = H / r.height;
                if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
                setTf((s) => ({ ...s, x: d.tx + (e.clientX - d.x) * sx, y: d.ty + (e.clientY - d.y) * sy }));
              }}
              onPointerUp={() => { if (drag.current && !drag.current.moved) setSel(null); drag.current = null; }}>
              <defs><pattern id="gr-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill={ch.grid} /></pattern></defs>
              <rect width={W} height={H} fill="url(#gr-dots)" />
              <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`}>
                {edges.map((e, k) => {
                  const a = pos[e.source], b = pos[e.target];
                  const on = neigh ? neigh.has(e.source) && neigh.has(e.target) && (e.source === focusId || e.target === focusId) : false;
                  return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? ch.node[byId[e.source === focusId ? e.target : e.source]?.type ?? "investigation"] : ch.edge}
                    strokeOpacity={neigh ? (on ? 0.9 : 0.06) : e.type === "RELATED_TO" ? 0.55 : 0.22} strokeWidth={(on ? 1.6 : e.type === "RELATED_TO" ? 1.3 : 0.8) / tf.k} strokeDasharray={e.type === "RELEVANT_TO" || e.origin === "curated_context" || e.origin === "text_match" ? `${4 / tf.k} ${3 / tf.k}` : undefined} />;
                })}
                {nodes.map((n) => {
                  const p = pos[n.id];
                  const dim = (neigh && !neigh.has(n.id)) || (matches && !matches.has(n.id));
                  const r = radius(n);
                  const showLabel = n.type === "investigation" || n.id === focusId || (neigh?.has(n.id) ?? false) || (matches?.has(n.id) ?? false) || tf.k > 1.5;
                  return (
                    <g key={n.id} data-node transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.16 : 1} className="cursor-pointer transition-opacity duration-200"
                      tabIndex={0} role="button" aria-label={`${t(`gr.type.${n.type}`)}: ${label(n)}`} aria-pressed={sel === n.id}
                      onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}
                      onClick={() => setSel(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(n.id); } }}>
                      {sel === n.id && <circle r={(r + 6) / Math.sqrt(tf.k)} fill="none" stroke={ch.node[n.type]} strokeOpacity={0.6} strokeWidth={1.5 / tf.k} />}
                      <circle r={r / Math.sqrt(tf.k)} fill={n.type === "investigation" ? ch.node[n.type] : ch.tipBg} stroke={ch.node[n.type]} strokeWidth={(n.type === "investigation" ? 0 : 2) / tf.k} />
                      {showLabel && <text y={-(r / Math.sqrt(tf.k)) - 5 / tf.k} textAnchor="middle" fontSize={(n.type === "investigation" ? 12 : 11) / tf.k} fontWeight={n.type === "investigation" ? 600 : 400} fill={ch.text} style={{ paintOrder: "stroke", stroke: ch.tipBg, strokeWidth: 3 / tf.k }}>{label(n).length > 34 ? label(n).slice(0, 32) + "…" : label(n)}</text>}
                    </g>
                  );
                })}
              </g>
            </svg>
            <div className="absolute bottom-3 left-3 flex gap-1 rounded-btn border border-line bg-surface p-1">
              <button className="icon-btn !h-8 !w-8" onClick={() => zoom(1.25)} aria-label={t("gr.zoomIn")}><Plus size={15} /></button>
              <button className="icon-btn !h-8 !w-8" onClick={() => zoom(0.8)} aria-label={t("gr.zoomOut")}><Minus size={15} /></button>
              <button className="icon-btn !h-8 !w-8" onClick={() => setTf({ x: 0, y: 0, k: 1 })} aria-label={t("gr.reset")}><Maximize2 size={14} /></button>
            </div>
            <p className="pointer-events-none absolute right-3 top-3 hidden rounded-ctl bg-surface px-2 py-1 text-[11px] text-subtle md:block">{t("gr.hint")}</p>
          </DarkZone>
          <aside className="panel p-4 xl:sticky xl:top-20 xl:self-start" aria-live="polite">
            {details || (
              <div className="space-y-4">
                <p className="text-[13px] leading-relaxed text-muted">{t("gr.selectHint")}</p>
                <div>
                  <p className="label mb-2">{t("gr.edges")}</p>
                  <ul className="space-y-2 text-[12px]">{edgeTypes.map((ty) => <li key={ty} className="grid grid-cols-[auto_1fr] gap-x-2"><span className="font-mono text-[10.5px] text-fg">{ty}</span><span className="text-right font-mono text-subtle">{g.data!.edges.filter((e) => e.type === ty).length}</span><span className="col-span-2 text-subtle">{t(`gr.edge.${ty}`)}</span></li>)}</ul>
                </div>
                <p className="rounded-ctl border border-dashed border-line-strong p-3 text-[11.5px] leading-relaxed text-subtle">{t("gr.honesty")}</p>
              </div>
            )}
          </aside>
        </div>
      ) : nodes.length === 0 ? <Empty icon={Network} text={t("gr.empty")} /> : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <caption className="sr-only">{t("gr.view.list")}</caption>
            <thead><tr className="border-b border-line text-left"><th className="p-3 font-medium text-subtle">{t("gr.node")}</th><th className="p-3 font-medium text-subtle">{t("gr.typeCol")}</th><th className="p-3 font-medium text-subtle">{t("gr.connectionsCol")}</th></tr></thead>
            <tbody>{nodes.filter((n) => !matches || matches.has(n.id)).sort((a, b) => TYPES.indexOf(a.type) - TYPES.indexOf(b.type) || b.degree - a.degree).map((n) => (
              <tr key={n.id} className="border-b border-line align-top last:border-0">
                <td className="p-3"><span className="font-medium text-fg">{label(n)}</span><span className="block font-mono text-[10.5px] text-subtle">{n.id}</span></td>
                <td className="p-3"><span className="inline-flex items-center gap-1.5 text-muted"><i className="h-2 w-2 rounded-full" style={{ background: ch.node[n.type] }} />{t(`gr.type.${n.type}`)}</span></td>
                <td className="p-3"><ul className="flex flex-wrap gap-1">{conns(n.id).filter(({ other }) => other && visible.has(other.id)).map(({ e, other }, k) => (
                  <li key={k}><button className="chip hover:border-line-strong hover:text-fg" onClick={() => { setSel(other!.id); setView("graph"); }} title={e.type}>{label(other!)}</button></li>))}</ul></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <p className="text-[11.5px] text-subtle">{t("gr.provenance")} <button className="text-accent hover:underline" onClick={() => go(href("sources"))}>{t("nav.sources")}</button></p>
    </Page>
  );
}

