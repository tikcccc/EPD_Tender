export type Severity = "major" | "minor" | "info";
export type ConsistencyStatus = "consistent" | "inconsistent" | "unknown";
export type StatusDomain = "consistency" | "compliance";
export type MatchStatus = "resolved_exact" | "resolved_approximate" | "unresolved";
export type StatusPresentation = "normalized" | "raw";
export type ManualVerdict = "accepted" | "rejected" | "needs_followup";
export type ManualVerdictCategory =
  | "evidence_gap"
  | "rule_dispute"
  | "false_positive"
  | "data_issue"
  | "other";

export interface ReportItem {
  item_id: string;
  consistency_status: ConsistencyStatus;
  status_domain?: StatusDomain;
  confidence_score: number;
  evidence: string;
  reasoning: string;
  document_references: string[];
  check_type: string;
  description: string;
  keywords: string[];
  source: string;
  severity: Severity;
  raw_status?: string;
  status_presentation?: StatusPresentation;
  source_pack?: string;
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
  check_type_domains?: Record<string, StatusDomain[]>;
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
  relative_path?: string;
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

export interface ProjectReportSourceSummary {
  source_id: string;
  label: string;
  order: number;
}

export interface WorkspaceProjectConfig {
  project_id: string;
  name: string;
  default_template_id: string;
  standards_catalog: StandardDefinition[];
  templates: StandardTemplate[];
  documents: DocumentReference[];
  report_sources: ProjectReportSourceSummary[];
}

export interface WorkspaceProjectsConfig {
  default_project_id: string;
  projects: WorkspaceProjectConfig[];
}

export interface IngestReportPayload {
  project_id?: string;
  report_source: string;
  report_items?: ReportItem[];
}

export interface IngestReportResult {
  report_id: string;
  project_id: string;
  items_count: number;
  invalid_items: Array<Record<string, string>>;
}

export interface ReportCardsResult {
  report_id: string;
  page: number;
  page_size: number;
  total: number;
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

export interface ManualReviewUpdatePayload {
  manual_verdict?: ManualVerdict | null;
  manual_verdict_category?: ManualVerdictCategory | null;
  manual_verdict_note?: string | null;
}

export interface ManualReviewUpdateResult {
  report_id: string;
  item: ReportItem;
}

export interface ManualReviewHistoryEntry {
  history_id: string;
  report_id: string;
  item_id: string;
  manual_verdict: ManualVerdict | null;
  manual_verdict_category: ManualVerdictCategory | null;
  manual_verdict_note: string | null;
  edited_at: string;
}

export interface ManualReviewHistoryResult {
  report_id: string;
  item_id: string;
  page: number;
  page_size: number;
  total: number;
  entries: ManualReviewHistoryEntry[];
}

export interface ManualReviewHistoryUpdateResult {
  report_id: string;
  item_id: string;
  item: ReportItem;
  entry: ManualReviewHistoryEntry;
}

export interface ManualReviewHistoryDeleteResult {
  report_id: string;
  item_id: string;
  item: ReportItem;
  deleted_history_id: string;
}

export interface ApiEnvelope<T> {
  code: string;
  message: string;
  request_id: string;
  data: T;
}
