import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Plus, Printer, RefreshCw, X } from "lucide-react";
import { api, MAX_COMPARE } from "../api";
import type { Inv, Source } from "../api";
import type { Key } from "../i18n";
import { useGet, ErrorBox, PageSkeleton, Empty, Spinner } from "../components/ui";
import { LogoMark } from "../components/Logo";
import { useToast } from "../components/Toast";
import { useI18n } from "../i18n";
import { go, href } from "../nav";
import type { Cmp } from "./CompareTable";
import type { Ans } from "./AnswerView";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const H2 = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <h2 className="mb-3 flex items-baseline gap-3 border-b border-line pb-2 text-[17px] font-semibold text-fg"><span className="font-mono text-[11px] text-subtle">{String(n).padStart(2, "0")}</span>{children}</h2>
);

/** Structured research report built only from stored records (+ optional assistant answer). Printed via the browser to PDF. */
export default function Reports({ params }: { params: URLSearchParams }) {
  const { t, tc, lang } = useI18n();
  const toast = useToast();
  const inv = useGet<Inv[]>("/investigations");
  const src = useGet<Source[]>("/sources");
  const ids = useMemo(() => Array.from(new Set((params.get("ids") ?? "").split(",").filter(Boolean))).slice(0, MAX_COMPARE), [params]);
  const setIds = (n: string[]) => go(href("reports", null, n.length ? { ids: n.join(",") } : undefined));
  const [title, setTitle] = useState("");
  const [opt, setOpt] = useState({ comparison: true, ai: false, method: true });
  const [cmp, setCmp] = useState<Cmp | null>(null);
  const [cmpErr, setCmpErr] = useState<unknown>(null);
  const [ai, setAi] = useState<Ans | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<unknown>(null);
  const [generated, setGenerated] = useState(() => new Date());

  const records = useMemo(() => (inv.data ? ids.map((id) => inv.data!.find((i) => i.id === id)).filter((x): x is Inv => !!x) : []), [inv.data, ids]);
  const srcById = useMemo(() => Object.fromEntries((src.data ?? []).map((s) => [s.id, s])), [src.data]);
  const refs = useMemo(() => Array.from(new Set(records.flatMap((r) => [...r.source_ids, ...r.findings.map((f) => f.source_id)]))), [records]);
  const refN = (id: string) => refs.indexOf(id) + 1;
  const aiQuestion = t("rp.aiQ", { names: records.map((r) => r.acronym).join(", ") });

  useEffect(() => { setGenerated(new Date()); }, [ids, lang]);
  useEffect(() => {
    if (ids.length < 2 || !opt.comparison) { setCmp(null); return; }
    let on = true; setCmpErr(null);
    api.post<Cmp>("/compare", { ids }).then((r) => on && setCmp(r)).catch((e) => on && setCmpErr(e));
    return () => { on = false; };
  }, [ids, opt.comparison, lang]);
  useEffect(() => {
    if (!opt.ai || records.length === 0) { setAi(null); return; }
    let on = true; setAiBusy(true); setAiErr(null);
    api.post<Ans>("/assistant", { question: aiQuestion }).then((r) => on && setAi(r)).catch((e) => on && setAiErr(e)).finally(() => on && setAiBusy(false));
    return () => { on = false; };
  }, [opt.ai, aiQuestion, records.length, lang]);

  if (inv.error) return <div className="mx-auto max-w-[1440px] px-4 pt-9 sm:px-6 lg:px-8"><ErrorBox error={inv.error} retry={inv.retry} /></div>;
  if (!inv.data || !src.data) return <div className="mx-auto max-w-[1440px] px-4 pt-9 sm:px-6 lg:px-8"><PageSkeleton /></div>;
  const avail = inv.data.filter((i) => !ids.includes(i.id));
  const docTitle = title.trim() || t("rp.defaultTitle", { names: records.map((r) => r.acronym).join(" · ") || "—" });
  const stamp = generated.toLocaleString(lang === "ru" ? "ru-RU" : "en-GB", { dateStyle: "long", timeStyle: "short" });
  const na = t("common.naLong");

  const toMd = () => {
    const L: string[] = [`# ${docTitle}`, "", `FLAMEWISE · ${t("rp.generated")}: ${generated.toISOString()}`, "", `> ${t("rp.disclaimer")}`, "", `## ${t("rp.s.records")}`];
    records.forEach((r) => {
      L.push("", `### ${r.acronym} — ${r.full_name} (${r.id})`, "", r.objective, "",
        `- ${t("det.fuel")}: ${tc("fuel", r.fuel_type)}`, `- ${t("det.material")}: ${r.fuel_material}`, `- ${t("det.hardware")}: ${r.hardware}`, `- ${t("det.gravity")}: ${r.gravity_environment}`,
        `- ${t("det.o2")}: ${r.oxygen_concentration ?? na}`, `- ${t("det.air")}: ${r.airflow_speed ?? na}`, "", `**${t("det.findings")}**`, ...r.findings.map((f) => `- ${f.text} [${refN(f.source_id)}]`),
        "", `**${t("det.limits")}**`, ...r.limitations.map((l) => `- ${l}`));
    });
    if (cmp) L.push("", `## ${t("rp.s.comparison")}`, "", cmp.summary, "", ...cmp.rows.map((row) => `- **${row.label}** (${t(row.status === "partial_missing" ? "cp.partial_missing" : (`cp.${row.status}` as "cp.same"))}): ${row.values.map((v, i) => `${cmp.investigations[i].acronym}: ${v === null ? na : Array.isArray(v) ? v.join("; ") : v}`).join(" | ")}`));
    if (ai) L.push("", `## ${t("rp.s.ai")}`, "", `_${ai.llm_used ? t("as.badge.live") : t("as.badge.demo")}_ — ${aiQuestion}`, "", ai.direct_answer, "", ai.interpretation);
    if (opt.method) L.push("", `## ${t("rp.s.method")}`, "", t("rp.method"), "", `## ${t("rp.s.limits")}`, "", ...Array.from(new Set(records.flatMap((r) => r.limitations))).map((l) => `- ${l}`), `- ${t("rp.limitNumeric")}`);
    const dsets = records.flatMap((r) => r.datasets ?? []);
    if (dsets.length) L.push("", `## ${t("v4.rp.datasets")}`, "", ...dsets.map((d, i) => `${i + 1}. NASA Physical Sciences Informatics. ${d.title} (${d.accession}). ${d.doi ? "https://doi.org/" + d.doi : d.landing_url}`));
    L.push("", `## ${t("rp.s.refs")}`, "", ...refs.map((id, i) => { const s = srcById[id]; return `${i + 1}. ${s?.title ?? id} — ${s?.publisher ?? ""}. ${s?.url ?? ""} (${s ? t(`src.kind.${s.link_kind}`) : ""})`; }));
    return L.join("\n") + "\n";
  };

  let sec = 0;
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-6 sm:px-6 md:pt-9 lg:px-8">
      <header className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="eyebrow reveal mb-2.5">{t("rp.eyebrow")}</p>
          <h1 className="reveal d-1 text-[28px] font-semibold tracking-[-0.03em] text-fg sm:text-[36px]">{t("rp.title")}</h1>
          <p className="reveal d-2 mt-2 text-[14px] leading-relaxed text-muted">{t("rp.sub")}</p>
        </div>
        {records.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => { download(`flamewise-report-${generated.toISOString().slice(0, 10)}.md`, toMd()); toast.push(t("cp.exported"), "success"); }}><Download size={14} />Markdown</button>
            <button className="btn btn-primary" onClick={() => window.print()} disabled={aiBusy}><Printer size={14} />{t("rp.print")}</button>
          </div>
        )}
      </header>

      <div className="report-grid grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="no-print min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="panel space-y-3 p-4">
            <p className="label">{t("rp.records", { n: ids.length, max: MAX_COMPARE })}</p>
            <ul className="space-y-1.5">{records.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-ctl border border-line bg-raised px-2.5 py-1.5 text-[13px]">
                <span className="min-w-0 truncate"><b className="font-semibold text-fg">{r.acronym}</b> <span className="font-mono text-[10.5px] text-subtle">{r.id}</span></span>
                <button className="rounded p-1 text-subtle hover:bg-hover hover:text-fg" onClick={() => setIds(ids.filter((x) => x !== r.id))} aria-label={t("cp.remove", { name: r.acronym })}><X size={13} /></button>
              </li>))}</ul>
            {ids.length < MAX_COMPARE && (
              <label className="flex items-center gap-1.5"><Plus size={14} className="text-subtle" aria-hidden="true" /><span className="sr-only">{t("cp.add")}</span>
                <select className="select min-w-0 !py-1.5" value="" onChange={(e) => e.target.value && setIds([...ids, e.target.value])}>
                  <option value="">{t("cp.addPh")}</option>{avail.map((i) => <option key={i.id} value={i.id}>{i.acronym} — {i.full_name}</option>)}
                </select></label>
            )}
          </div>
          <div className="panel space-y-3 p-4">
            <label className="block"><span className="label mb-1 block">{t("rp.titleLabel")}</span>
              <input className="input" value={title} placeholder={docTitle} onChange={(e) => setTitle(e.target.value)} maxLength={140} /></label>
            <fieldset className="space-y-2 pt-1">
              <legend className="label mb-1">{t("rp.include")}</legend>
              {([["comparison", t("rp.o.comparison"), ids.length < 2], ["ai", t("rp.o.ai"), records.length === 0], ["method", t("rp.o.method"), false]] as const).map(([k, l, dis]) => (
                <label key={k} className={`flex items-start gap-2 text-[13px] ${dis ? "opacity-45" : "cursor-pointer text-fg"}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" checked={opt[k] && !dis} disabled={dis} onChange={(e) => setOpt({ ...opt, [k]: e.target.checked })} />{l}
                </label>
              ))}
            </fieldset>
            <p className="text-[11.5px] leading-relaxed text-subtle">{t("rp.pdfHint")}</p>
            <button className="btn btn-sm w-full" onClick={() => setGenerated(new Date())}><RefreshCw size={13} />{t("rp.regenerate")}</button>
          </div>
        </aside>

        {records.length === 0 ? (
          <Empty icon={FileText} title={t("rp.emptyTitle")} text={t("rp.empty")} action={<div className="flex flex-wrap justify-center gap-2"><a className="btn" href={href("explorer")}>{t("cp.browse")}</a><a className="btn" href={href("reports", null, { ids: "BASS_001,SAFFIRE_001" })}>{t("rp.example")}</a></div>} />
        ) : (
          <article className="report-doc paper mx-auto w-full max-w-[860px] border border-line bg-surface px-6 py-8 text-fg shadow-card sm:px-12 sm:py-12">
            <header className="mb-8 border-b-2 border-fg pb-5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><LogoMark size={22} className="text-accent" /><span className="text-[12px] font-bold tracking-[.2em]">FLAMEWISE</span></span>
                <span className="font-mono text-[10.5px] uppercase tracking-[.14em] text-subtle">{t("rp.kind")}</span>
              </div>
              <h1 className="mt-6 text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">{docTitle}</h1>
              <dl className="mt-4 grid gap-x-6 gap-y-1 text-[12px] text-muted sm:grid-cols-2">
                <div><dt className="inline text-subtle">{t("rp.generated")}: </dt><dd className="inline font-mono">{stamp}</dd></div>
                <div><dt className="inline text-subtle">{t("rp.scope")}: </dt><dd className="inline">{records.map((r) => r.id).join(", ")}</dd></div>
              </dl>
              <p className="mt-4 rounded-ctl border border-warn/40 bg-warn/[.07] px-3 py-2 text-[11.5px] leading-relaxed text-muted">{t("rp.disclaimer")}</p>
            </header>

            <section className="mb-8">
              <H2 n={++sec}>{t("rp.s.records")}</H2>
              <div className="space-y-6">{records.map((r) => (
                <div key={r.id}>
                  <h3 className="text-[15px] font-semibold">{r.acronym} — {r.full_name} <span className="font-mono text-[11px] font-normal text-subtle">{r.id}</span></h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{r.objective}</p>
                  <table className="mt-3 w-full text-[12px]"><tbody>
                    {([[t("det.fuel"), tc("fuel", r.fuel_type)], [t("det.material"), r.fuel_material], [t("det.hardware"), r.hardware], [t("det.gravity"), r.gravity_environment],
                      [t("det.o2"), r.oxygen_concentration ?? null], [t("det.air"), r.airflow_speed ?? null], [t("det.fsd"), tc("sd", r.fire_safety_domain)]] as const).map(([k, v]) => (
                      <tr key={k} className="border-b border-line"><th className="w-44 py-1.5 pr-3 text-left font-medium text-subtle">{k}</th><td className="py-1.5">{v === null ? <i className="text-subtle">{na}</i> : v}</td></tr>))}
                  </tbody></table>
                  {(r.datasets ?? []).map((d) => (
                    <div key={d.accession} className="mt-3 text-[12px]">
                      <p className="font-semibold">{t("v4.det.dataset")}: <span className="font-mono font-normal">{d.accession}</span>{d.doi && <> · <a className="font-mono font-normal text-accent underline" href={`https://doi.org/${d.doi}`}>DOI {d.doi}</a></>}</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 font-mono text-[11px] text-muted">
                        {d.conditions.filter((c) => ["oxygen", "pressure", "flow"].includes(c.parameter)).map((c, k) => <li key={k}>{t(`v4.param.${c.parameter}` as Key)}: {c.kind === "numeric" ? `${c.min} – ${c.max}` : (c.examples ?? []).slice(0, 3).join("; ")} [{c.column}] ({c.filled_rows}/{c.total_rows})</li>)}
                      </ul>
                    </div>
                  ))}
                  <p className="mt-3 text-[12px] font-semibold">{t("det.findings")}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed">{r.findings.map((f) => <li key={f.text}>{f.text} <sup className="font-mono text-accent">[{refN(f.source_id)}]</sup></li>)}</ul>
                  <p className="mt-2 text-[12px] font-semibold">{t("det.limits")}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>))}</div>
            </section>

            {opt.comparison && ids.length >= 2 && (
              <section className="mb-8">
                <H2 n={++sec}>{t("rp.s.comparison")}</H2>
                {cmpErr != null ? <ErrorBox error={cmpErr} /> : !cmp ? <p className="flex items-center gap-2 text-[12.5px] text-muted"><Spinner size={13} />{t("cp.loading")}…</p> : (<>
                  <p className="mb-3 text-[12.5px] leading-relaxed">{cmp.summary}</p>
                  <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-[11.5px]">
                    <thead><tr className="border-b border-fg/40 text-left"><th className="py-1.5 pr-2">{t("cp.param")}</th>{cmp.investigations.map((i) => <th key={i.id} className="py-1.5 pr-2">{i.acronym}</th>)}<th className="py-1.5">{t("cp.status")}</th></tr></thead>
                    <tbody>{cmp.rows.filter((r) => r.key !== "findings" && r.key !== "limitations").map((r) => (
                      <tr key={r.key} className="border-b border-line align-top"><th className="py-1.5 pr-2 text-left font-medium text-subtle">{r.label}</th>
                        {r.values.map((v, i) => <td key={i} className="py-1.5 pr-2">{v === null ? <i className="text-subtle">{t("cp.notInKb")}</i> : Array.isArray(v) ? v.join("; ") : String(v)}</td>)}
                        <td className="py-1.5">{t(r.status === "partial_missing" ? "cp.partial_missing" : (`cp.${r.status}` as "cp.same"))}</td></tr>))}</tbody>
                  </table></div>
                </>)}
              </section>
            )}

            {opt.ai && (
              <section className="mb-8">
                <H2 n={++sec}>{t("rp.s.ai")}</H2>
                {aiErr != null ? <ErrorBox error={aiErr} /> : aiBusy || !ai ? <p className="flex items-center gap-2 text-[12.5px] text-muted"><Spinner size={13} />{t("as.loading")}…</p> : (<>
                  <p className="mb-2 text-[11.5px] text-subtle"><b>{ai.llm_used ? t("as.badge.live") : t("as.badge.demo")}</b> · {t("rp.aiAsked")}: “{aiQuestion}”</p>
                  <p className="text-[13px] leading-relaxed">{ai.direct_answer}</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted"><b className="text-fg">{t("as.sec4")}:</b> {ai.interpretation}</p>
                  <p className="mt-2 text-[11.5px] italic text-subtle">{t("rp.aiNote")}</p>
                </>)}
              </section>
            )}

            {opt.method && (
              <section className="mb-8">
                <H2 n={++sec}>{t("rp.s.method")}</H2>
                <p className="text-[12.5px] leading-relaxed text-muted">{t("rp.method")}</p>
                <h3 className="mt-4 text-[13px] font-semibold">{t("rp.s.limits")}</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted">
                  {Array.from(new Set(records.flatMap((r) => r.limitations))).map((l) => <li key={l}>{l}</li>)}
                  <li>{t("rp.limitNumeric")}</li>
                </ul>
              </section>
            )}

            <section>
              <H2 n={++sec}>{t("rp.s.refs")}</H2>
              <ol className="space-y-2 text-[12px] leading-relaxed">{refs.map((id, i) => { const s = srcById[id]; return (
                <li key={id} className="grid grid-cols-[2rem_1fr]"><span className="font-mono text-subtle">[{i + 1}]</span>
                  <span>{s ? <>{s.title}. {s.publisher}. <a href={s.url} className="break-all text-accent underline">{s.url}</a> <i className="text-subtle">({t(`src.kind.${s.link_kind}`)})</i></> : <>{id} — <i>{na}</i></>}</span></li>); })}</ol>
            </section>
            {records.some((r) => (r.datasets ?? []).length) && (
              <section className="mt-6">
                <h3 className="text-[13px] font-semibold">{t("v4.rp.datasets")}</h3>
                <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed">
                  {records.flatMap((r) => r.datasets ?? []).map((d) => (
                    <li key={d.accession}>NASA Physical Sciences Informatics. <i>{d.title}</i> ({d.accession}){d.release_date ? `, ${d.release_date}` : ""}{d.version ? `, v${d.version}` : ""}. {d.doi ? <a className="text-accent underline" href={`https://doi.org/${d.doi}`}>https://doi.org/{d.doi}</a> : <a className="text-accent underline" href={d.landing_url}>{d.landing_url}</a>}</li>
                  ))}
                </ol>
              </section>
            )}
            <footer className="mt-10 border-t border-line pt-3 text-[10.5px] leading-relaxed text-subtle">{t("footer.text")}</footer>
          </article>
        )}
      </div>
    </div>
  );
}
