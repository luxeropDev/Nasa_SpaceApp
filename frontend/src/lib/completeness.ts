import type { Inv, Source } from "../api";

/**
 * Metadata a record can carry. "oxygen_concentration" / "airflow_speed" count as present when either a single value is
 * stored on the record or a linked PSI experiment table publishes per-test oxygen / flow values.
 */
export const FIELDS = ["fuel_material", "hardware", "gravity_environment", "psi_accessions", "oxygen_concentration", "airflow_speed", "measurement_types", "findings", "source_ids"] as const;
export type FieldKey = (typeof FIELDS)[number];

export type Flag = "partial" | "complete" | "noNumeric" | "verify" | "qualitative" | "psiTable";
export type Completeness = { present: FieldKey[]; missing: FieldKey[]; ratio: number; flags: Flag[] };

const psiHas = (i: Inv, p: string) => (i.datasets ?? []).some((d) => d.conditions.some((c) => c.parameter === p));

const has = (i: Inv, f: FieldKey): boolean => {
  if (f === "oxygen_concentration") return i.oxygen_concentration !== null || psiHas(i, "oxygen");
  if (f === "airflow_speed") return i.airflow_speed !== null || psiHas(i, "flow");
  const v = i[f];
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim() !== "";
};

/**
 * Honest data-completeness assessment for one record.
 * - "psiTable": a linked PSI experiment table publishes per-test conditions.
 * - "noNumeric": no stored value and no PSI table with oxygen, pressure or flow.
 * - "verify": no source links to a specific document or dataset landing page.
 * - "qualitative": the curated findings are text summaries.
 */
export function completeness(i: Inv, srcs: Record<string, Source>): Completeness {
  const present = FIELDS.filter((f) => has(i, f));
  const missing = FIELDS.filter((f) => !has(i, f));
  const flags: Flag[] = [missing.length ? "partial" : "complete"];
  const table = (i.datasets ?? []).some((d) => d.conditions.some((c) => ["oxygen", "pressure", "flow"].includes(c.parameter)));
  if (table) flags.push("psiTable");
  else if (i.oxygen_concentration === null && i.airflow_speed === null) flags.push("noNumeric");
  if (i.findings.length > 0) flags.push("qualitative");
  const kinds = i.source_ids.map((s) => srcs[s]?.link_kind).filter(Boolean);
  if (!kinds.includes("direct") && !(i.datasets ?? []).length) flags.push("verify");
  return { present, missing, ratio: present.length / FIELDS.length, flags };
}
