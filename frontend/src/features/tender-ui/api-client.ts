import type {
  ApiEnvelope,
  IngestReportPayload,
  IngestReportResult,
  NecTemplatePayload,
  ReportCardsResult,
  ResolveEvidencePayload,
  ResolveEvidenceResult,
  SelectedStandard,
} from "./types";

const FALLBACK_API_BASE = "http://localhost:8000";

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configured) {
    return FALLBACK_API_BASE;
  }

  return configured.replace(/\/$/, "");
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T> | { message?: string };

  if (!response.ok) {
    const message = "message" in payload && payload.message ? payload.message : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  if (!("code" in payload) || payload.code !== "OK") {
    const message = "message" in payload && payload.message ? payload.message : "Unexpected API response";
    throw new Error(message);
  }

  return payload.data;
}

export async function fetchNecTemplate(): Promise<NecTemplatePayload> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/templates/nec`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseEnvelope<NecTemplatePayload>(response);
}

export async function ingestReport(payload: IngestReportPayload): Promise<IngestReportResult> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/reports/ingest`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseEnvelope<IngestReportResult>(response);
}

export async function fetchReportCards(reportId: string): Promise<ReportCardsResult> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/reports/${reportId}/cards`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseEnvelope<ReportCardsResult>(response);
}

export async function resolveEvidence(payload: ResolveEvidencePayload): Promise<ResolveEvidenceResult> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/evidence/resolve`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseEnvelope<ResolveEvidenceResult>(response);
}

export async function exportReportFile(payload: {
  report_id: string;
  format: "docx" | "pdf";
  selected_standards: SelectedStandard[];
  card_ids: string[];
}): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`${getApiBaseUrl()}/api/v1/exports/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Export failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep status fallback message.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("Content-Disposition") ?? "";
  const match = contentDisposition.match(/filename="?([^\";]+)"?/i);
  const fallback = `tender-analysis-${Date.now()}.${payload.format}`;

  return {
    blob,
    fileName: match?.[1] ?? fallback,
  };
}
