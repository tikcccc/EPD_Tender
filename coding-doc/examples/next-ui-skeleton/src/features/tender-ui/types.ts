export type Severity = "major" | "minor" | "info";
export type ConsistencyStatus = "consistent" | "inconsistent" | "unknown";

export interface ReportCardItem {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  status: ConsistencyStatus;
  confidence: number;
  tags: string[];
}
