export type Finding = { text: string; source_id: string };
export type Inv = {
  id: string; acronym: string; full_name: string; fuel_type: string; fuel_material: string; gravity_environment: string;
  objective: string; oxygen_concentration: number | null; airflow_speed: number | null; hardware: string;
  measurement_types: string[]; research_domain: string; fire_safety_domain: string; relevance: string[]; relevance_note: string;
  known_conditions: string[]; findings: Finding[]; limitations: string[]; related: string[]; source_ids: string[];
  record_type: string; numeric_data_status: string;
};
export type LinkKind = "search" | "portal" | "direct";
export type Source = { id: string; title: string; publisher: string; type: string; url: string; note: string; link_kind: LinkKind };
export type Health = { status: string; dataset_version: string; mode: string; llm_provider: string | null; llm_live: boolean };

export type GraphNodeType = "investigation" | "source" | "research_domain" | "safety_domain" | "fuel" | "scenario";
export type GraphNode = { id: string; type: GraphNodeType; label: string; degree: number; full_name?: string; url?: string; link_kind?: LinkKind; code?: string };
export type GraphEdge = { source: string; target: string; type: "RELATED_TO" | "CITES" | "INVESTIGATES" | "ADDRESSES" | "USES_FUEL" | "RELEVANT_TO"; basis: string };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type ScenarioMap = {
  key: string; label: string;
  investigations: { id: string; acronym: string; full_name: string; fire_safety_domain: string; fuel_type: string; research_domain: string; relevance_note: string; finding: Finding | null }[];
  domain_coverage: { domain: string; count: number }[]; missing_domains: string[]; research_domains: string[];
  sources: { id: string; title: string; url: string; link_kind: LinkKind }[]; limitations: string[]; knowledge_gaps: string[]; numeric_measurements: number;
};

export const SCENARIOS = ["iss", "lunar_habitat", "lunar_rover", "mars_transit"] as const;
export const SAFETY_DOMAINS = ["prevention", "material_flammability", "smoke_detection", "suppression"] as const;
export const MAX_COMPARE = 4;
/** Investigation "family" (program) is the id prefix, e.g. SAFFIRE_002 -> SAFFIRE. */
export const family = (id: string) => id.split("_")[0];

/** Typed API failure; the UI maps `kind`/`status` to a localized message. */
export class ApiError extends Error {
  constructor(public kind: "network" | "http", public status = 0, public detail = "") { super(detail || kind); }
}

let lang = "en";
export const setApiLang = (l: string) => { lang = l; };

async function req<T>(path: string, body?: unknown): Promise<T> {
  const url = "/api" + path + (body === undefined ? (path.includes("?") ? "&" : "?") + "lang=" + lang : "");
  let r: Response;
  try {
    r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(body as object), lang }) });
  } catch {
    throw new ApiError("network");
  }
  if (!r.ok) {
    let d = "";
    try { const j = await r.json(); d = typeof j.detail === "string" ? j.detail : ""; } catch { /* non-JSON error body */ }
    throw new ApiError("http", r.status, d);
  }
  return r.json();
}
export const api = { get: <T,>(p: string) => req<T>(p), post: <T,>(p: string, b: unknown) => req<T>(p, b) };
