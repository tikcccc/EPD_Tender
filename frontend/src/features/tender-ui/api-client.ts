import type {
  ApiEnvelope,
  ManualReviewHistoryDeleteResult,
  IngestReportPayload,
  IngestReportResult,
  ManualReviewHistoryResult,
  ManualReviewHistoryUpdateResult,
  ManualReviewUpdatePayload,
  ManualReviewUpdateResult,
  NecTemplatePayload,
  ReportCardsResult,
  ResolveEvidencePayload,
  ResolveEvidenceResult,
  SelectedStandard,
  WorkspaceProjectsConfig,
} from "./types";

const FALLBACK_API_BASE = "http://localhost:8000";
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;

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

async function apiFetch(input: string, init?: RequestInit, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }

    if (error instanceof Error) {
      throw error;
    }

    throw new Error("Network request failed.");
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchNecTemplate(): Promise<NecTemplatePayload> {
  const response = await apiFetch(`${getApiBaseUrl()}/api/v1/templates/nec`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseEnvelope<NecTemplatePayload>(response);
}

export async function fetchWorkspaceProjectsConfig(): Promise<WorkspaceProjectsConfig> {
  const response = await apiFetch(`${getApiBaseUrl()}/api/v1/projects/config`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseEnvelope<WorkspaceProjectsConfig>(response);
}

export async function ingestReport(payload: IngestReportPayload): Promise<IngestReportResult> {
  const response = await apiFetch(`${getApiBaseUrl()}/api/v1/reports/ingest`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseEnvelope<IngestReportResult>(response);
}

export async function fetchReportCards(
  reportId: string,
  options?: {
    page?: number;
    pageSize?: number;
    q?: string;
    checkType?: string;
    severity?: string;
    status?: string;
    reviewType?: "all" | "consistency" | "compliance";
  },
): Promise<ReportCardsResult> {
  const query = new URLSearchParams();
  if (options?.page) {
    query.set("page", String(options.page));
  }
  if (options?.pageSize) {
    query.set("page_size", String(options.pageSize));
  }
  if (options?.q) {
    query.set("q", options.q);
  }
  if (options?.checkType && options.checkType !== "all") {
    query.set("check_type", options.checkType);
  }
  if (options?.severity && options.severity !== "all") {
    query.set("severity", options.severity);
  }
  if (options?.status && options.status !== "all") {
    query.set("status", options.status);
  }
  if (options?.reviewType && options.reviewType !== "all") {
    query.set("review_type", options.reviewType);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiFetch(`${getApiBaseUrl()}/api/v1/reports/${reportId}/cards${suffix}`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });

  return parseEnvelope<ReportCardsResult>(response);
}

export async function resolveEvidence(payload: ResolveEvidencePayload): Promise<ResolveEvidenceResult> {
  const response = await apiFetch(`${getApiBaseUrl()}/api/v1/evidence/resolve`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseEnvelope<ResolveEvidenceResult>(response);
}

export async function updateManualReview(
  reportId: string,
  itemId: string,
  payload: ManualReviewUpdatePayload,
): Promise<ManualReviewUpdateResult> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/api/v1/reports/${encodeURIComponent(reportId)}/cards/${encodeURIComponent(itemId)}/manual-review`,
    {
      method: "PATCH",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return parseEnvelope<ManualReviewUpdateResult>(response);
}

export async function fetchManualReviewHistory(
  reportId: string,
  itemId: string,
  page: number,
  pageSize: number,
): Promise<ManualReviewHistoryResult> {
  const query = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  const response = await apiFetch(
    `${getApiBaseUrl()}/api/v1/reports/${encodeURIComponent(reportId)}/cards/${encodeURIComponent(itemId)}/manual-reviews?${query.toString()}`,
    {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return parseEnvelope<ManualReviewHistoryResult>(response);
}

export async function updateManualReviewHistoryEntry(
  reportId: string,
  itemId: string,
  historyId: string,
  payload: ManualReviewUpdatePayload,
): Promise<ManualReviewHistoryUpdateResult> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/api/v1/reports/${encodeURIComponent(reportId)}/cards/${encodeURIComponent(itemId)}/manual-reviews/${encodeURIComponent(historyId)}`,
    {
      method: "PATCH",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  return parseEnvelope<ManualReviewHistoryUpdateResult>(response);
}

export async function deleteManualReviewHistoryEntry(
  reportId: string,
  itemId: string,
  historyId: string,
): Promise<ManualReviewHistoryDeleteResult> {
  const response = await apiFetch(
    `${getApiBaseUrl()}/api/v1/reports/${encodeURIComponent(reportId)}/cards/${encodeURIComponent(itemId)}/manual-reviews/${encodeURIComponent(historyId)}`,
    {
      method: "DELETE",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  return parseEnvelope<ManualReviewHistoryDeleteResult>(response);
}

export async function exportReportFile(payload: {
  report_id: string;
  format: "docx" | "pdf";
  selected_standards: SelectedStandard[];
  card_ids: string[];
}): Promise<{ blob: Blob; fileName: string }> {
  const response = await apiFetch(`${getApiBaseUrl()}/api/v1/exports/report`, {
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
