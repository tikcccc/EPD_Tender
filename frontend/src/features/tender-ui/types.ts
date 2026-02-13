export type Severity = "major" | "minor" | "info";
export type ConsistencyStatus = "consistent" | "inconsistent" | "unknown";
export type MatchStatus = "resolved_exact" | "resolved_approximate" | "unresolved";

export interface ReportItem {
  item_id: string;
  consistency_status: ConsistencyStatus;
  confidence_score: number;
  evidence: string;
  reasoning: string;
  document_references: string[];
  check_type: string;
  description: string;
  keywords: string[];
  source: string;
  severity: Severity;
  manual_verdict?: string;
  manual_verdict_category?: string;
  manual_verdict_note?: string;
  anchors?: EvidenceAnchor[];
}

export interface StandardDefinition {
  standard_id: string;
  name: string;
  description: string;
  default_priority: number;
  enabled_by_default: boolean;
  check_types: string[];
}

export interface StandardTemplateEntry {
  standard_id: string;
  priority: number;
}

export interface StandardTemplate {
  template_id: string;
  name: string;
  standards: StandardTemplateEntry[];
}

export interface SelectedStandard {
  standard_id: string;
  name: string;
  priority: number;
}

export interface DocumentReference {
  document_id: string;
  file_name: string;
  display_name: string;
}

export interface TenderUiConfig {
  schema_version: string;
  updated_at: string;
  standards_catalog: StandardDefinition[];
  templates: StandardTemplate[];
  default_template_id: string;
  documents: DocumentReference[];
}

export interface EvidenceWorkspaceState {
  item_id: string;
  document_id: string;
  file_name: string;
  display_name: string;
  page: number;
  quote: string;
  bbox: BBox | null;
  bboxes?: BBox[] | null;
  match_status: MatchStatus;
  loading: boolean;
  error?: string;
}

export interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  unit: "pt";
  origin: "top-left";
}

export interface EvidenceAnchor {
  anchor_id: string;
  document_id: string;
  page: number;
  quote: string;
  bbox?: BBox | null;
  bboxes?: BBox[] | null;
  match_method: "exact" | "fuzzy" | "manual";
  match_score: number;
  status: MatchStatus;
}

export interface NecTemplateStandard {
  standard_id: string;
  name: string;
  default_priority: number;
  enabled_by_default: boolean;
  check_types: string[];
}

export interface NecTemplatePayload {
  template_id: string;
  name: string;
  standards: NecTemplateStandard[];
  documents: DocumentReference[];
}

export interface IngestReportPayload {
  report_source: string;
  report_items?: ReportItem[];
}

export interface IngestReportResult {
  report_id: string;
  items_count: number;
  invalid_items: Array<Record<string, string>>;
}

export interface ReportCardsResult {
  report_id: string;
  cards: ReportItem[];
}

export interface ResolveEvidencePayload {
  report_id: string;
  item_id: string;
  document_id: string;
  evidence_text: string;
  hints?: {
    clause_keyword?: string;
  };
}

export interface ResolveEvidenceResult {
  item_id: string;
  document_id: string;
  file_name: string;
  anchors: EvidenceAnchor[];
}

export interface ApiEnvelope<T> {
  code: string;
  message: string;
  request_id: string;
  data: T;
}
