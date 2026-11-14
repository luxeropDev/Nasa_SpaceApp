export type Finding = { text: string; source_id: string };
export type Inv = {
  id: string; acronym: string; full_name: string; fuel_type: string; fuel_material: string; gravity_environment: string;
  objective: string; oxygen_concentration: number | null; airflow_speed: number | null; hardware: string;
  measurement_types: string[]; research_domain: string; fire_safety_domain: string; relevance: string[]; relevance_note: string;
  known_conditions: string[]; findings: Finding[]; limitations: string[]; related: string[]; source_ids: string[];
  record_type: string; numeric_data_status: string; psi_accessions: string[];
  /** PSI dataset cards attached by the API (computed from ingested NASA PSI records). */
  datasets?: DatasetCard[];
  /** Pages of extracted documents that name this investigation. */
  document_mentions?: Mention[];
};
export type Condition = {
  parameter: "oxygen" | "pressure" | "flow" | "diluent" | "fuel" | "result"; column: string; kind: "numeric" | "text" | null;
  filled_rows: number; total_rows: number; accession: string; table_file: string; min?: number; max?: number; examples?: string[];
};
export type DatasetCard = {
  accession: string; title: string; acronym: string | null; doi: string | null; landing_url: string; project_type: string | null;
  flight_platform: string | null; nasa_center: string | null; sub_research_area: string | null; start_date: string | null; end_date: string | null;
  release_date: string | null; version: number | null; license: string | null; hardware: string | null; publication_count: number;
  experiment_rows: number; experiment_columns: number; file_categories: Record<string, number>; conditions: Condition[]; kb_record?: string | null;
};
export type Publication = { title: string; authors: string | null; doi: string | null };
export type DatasetFull = DatasetCard & {
  objective: string; approach: string; hypothesis: string | null; research_impacts: string | null; publications: Publication[];
  contacts: { name: string; affiliation: string | null; role: string | null }[]; related_accessions: string[]; kb_records: string[];
  experiment_table: { file_name: string; row_count: number; columns: string[]; encoding: string; sha256: string } | null;
  provenance: { api_url: string; raw_sha256: string; discovered_by: string[] };
};
export type Mention = { doc_id: string; doc_title: string; page: number | null; section: string | null; names: string[] };
export type EvidenceClass = "experimental_evidence" | "scientific_publication" | "historical_incident" | "technology_transfer" | "background";
export type ResourceStatus = "FULLY_INTEGRATED" | "PARTIALLY_INTEGRATED" | "LINK_ONLY" | "NOT_INTEGRATED" | "UNAVAILABLE" | "REQUIRES_VERIFICATION";
export const STAGES = ["discovered", "accessible", "metadata_imported", "content_extracted", "indexed", "searchable", "connected", "citable"] as const;
export type Resource = {
  number: number; source_id: string; doc_id: string | null; title: string; publisher: string; url: string; role: string; evidence_class: EvidenceClass;
  date: string | null; verified_on: string; stages: Record<(typeof STAGES)[number], boolean>; missing_stages: string[];
  detail: Record<string, unknown>; exclusion: string | null; status: ResourceStatus;
};
export type Resources = { summary: { total: number; by_status: Partial<Record<ResourceStatus, number>>; stage_totals: Record<string, number>; challenge_url: string; verified_on: string }; resources: Resource[] };
export type DocMeta = {
  id: string; title: string; publisher: string; authors: string[]; date: string | null; report_number?: string | null; category: string; evidence_class: EvidenceClass;
  url: string; landing_url?: string | null; format: string; page_count: number | null; sha256: string; retrieved_at: string; challenge_resource: number | null;
  extraction: { status: string; method: string | null; ocr: boolean; errors: string[]; empty_pages?: number[] }; sections: { title: string; page: number }[]; chars: number; passages: number;
};
export type Passage = { id: string; doc_id: string; doc_title: string; page: number | null; section: string | null; text: string; evidence_class: EvidenceClass; score: number; matched_terms: string[] };
export type ContextRec = {
  id: string; kind: "historical_incident" | "technology_transfer"; year: number; title: string; source: Source; doc_id: string;
  facts: { text: string; excerpt: string }[]; relevance: string; related_investigations: string[];
};
export type SearchWhy = { fields: Record<string, string[]>; exact_identifier: string | null; expanded_terms: string[] };
export type Provenance = {
  psi_investigations: number; psi_linked: number; psi_unlinked: string[]; psi_with_table: number; psi_table_rows: number; psi_publications: number;
  psi_publications_with_doi: number; psi_ingested_at: string | null; documents: number; document_pages: number; passages: number; context_records: number;
  records_with_parameter: Record<string, number>; records_total: number;
};
export type LinkKind = "search" | "portal" | "direct";
export type Source = {
  id: string; title: string; publisher: string; type: string; url: string; note: string; link_kind: LinkKind;
  category: string; evidence_class: EvidenceClass; verification: string; accessed: string | null; date: string | null; authors: string[];
  report_number: string | null; doi: string | null; challenge_resource: number | null;
};
export type Health = { status: string; dataset_version: string; mode: string; llm_provider: string | null; llm_live: boolean };

export type GraphNodeType = "investigation" | "source" | "research_domain" | "safety_domain" | "fuel" | "scenario" | "dataset" | "document" | "context";
export type GraphNode = { id: string; type: GraphNodeType; label: string; degree: number; full_name?: string; url?: string; link_kind?: LinkKind; code?: string; doi?: string; context_kind?: string; year?: number; evidence_class?: string };
export type EdgeOrigin = "kb" | "psi" | "text_match" | "curated_context";
export type GraphEdge = { source: string; target: string; type: "RELATED_TO" | "CITES" | "INVESTIGATES" | "ADDRESSES" | "USES_FUEL" | "RELEVANT_TO" | "DOCUMENTED" | "PSI_RELATED" | "MENTIONED_IN" | "CONTEXT_FOR"; basis: string; origin: EdgeOrigin };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

export type ScenarioMap = {
  key: string; label: string;
  investigations: { id: string; acronym: string; full_name: string; fire_safety_domain: string; fuel_type: string; research_domain: string; relevance_note: string; finding: Finding | null }[];
  domain_coverage: { domain: string; count: number }[]; missing_domains: string[]; research_domains: string[];
  sources: { id: string; title: string; url: string; link_kind: LinkKind }[]; limitations: string[]; knowledge_gaps: string[]; numeric_measurements: number;
  datasets: { investigation: string; accession: string; doi: string | null; url: string; parameters: string[] }[];
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
