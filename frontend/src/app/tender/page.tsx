"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TenderAppShell } from "@/components/layout/TenderAppShell";
import { PdfWorkspace } from "@/components/pdf/PdfWorkspace";
import { ComplianceCard } from "@/components/report/ComplianceCard";
import { WorkspaceBottomBar } from "@/components/toolbar/WorkspaceBottomBar";
import { WorkspaceToolbar } from "@/components/toolbar/WorkspaceToolbar";
import {
  deleteManualReviewHistoryEntry,
  exportReportFile,
  fetchNecTemplate,
  fetchReportCards,
  ingestReport,
  resolveEvidence,
  updateManualReviewHistoryEntry,
  updateManualReview,
} from "@/features/tender-ui/api-client";
import type {
  DocumentReference,
  EvidenceAnchor,
  EvidenceWorkspaceState,
  ManualReviewUpdatePayload,
  MatchStatus,
  NecTemplatePayload,
  ReportItem,
  ResolveEvidenceResult,
  SelectedStandard,
} from "@/features/tender-ui/types";

const FALLBACK_DOCUMENT: DocumentReference = {
  document_id: "unknown",
  file_name: "unknown.pdf",
  display_name: "Unknown Document",
};
const REFERENCE_MARKER_RE = /from\s+(?:document\s+)?([a-z0-9._-]+)(?:\s*,[^:\n]+)?\s*:/gi;
const QUOTED_SEGMENT_PATTERNS = [/"([^"]+)"/g, /“([^”]+)”/g];

type ResolveCandidate = {
  order: number;
  document_id: string;
  evidence_text: string;
  reference_id: string;
  anchor: EvidenceAnchor;
  payload: ResolveEvidenceResult;
};

type ToolbarDocumentOption = {
  documentId: string;
  label: string;
};

function estimatePage(evidenceText: string): number {
  const clause = evidenceText.match(/(?:Clause\s*)?(\d{1,3})(?:\.\d+)?/i);
  if (!clause) {
    return 1;
  }

  const page = Number.parseInt(clause[1], 10);
  if (Number.isNaN(page)) {
    return 1;
  }

  return Math.min(120, Math.max(1, page));
}

function normalizeQuote(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 380);
}

function toDocumentMap(template: NecTemplatePayload | null): Record<string, DocumentReference> {
  if (!template) {
    return {};
  }
  return Object.fromEntries(template.documents.map((document) => [document.document_id, document]));
}

function normalizeEvidenceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeKeyword(text: string): string {
  return text.trim().toLowerCase();
}

function matchesKeywordFuzzySearch(keywords: string[], searchText: string): boolean {
  const query = normalizeKeyword(searchText);
  if (!query) {
    return true;
  }

  const normalizedKeywords = keywords.map(normalizeKeyword).filter(Boolean);
  if (normalizedKeywords.length === 0) {
    return false;
  }

  if (normalizedKeywords.some((keyword) => keyword.includes(query))) {
    return true;
  }

  const queryTokens = query.split(/\s+/).filter(Boolean);
  return queryTokens.every((token) =>
    normalizedKeywords.some((keyword) => keyword.includes(token) || token.includes(keyword)),
  );
}

function extractQuotedSegments(text: string): string[] {
  const segments: string[] = [];

  QUOTED_SEGMENT_PATTERNS.forEach((pattern) => {
    const regex = new RegExp(pattern);
    segments.push(
      ...Array.from(text.matchAll(regex))
        .map((match) => normalizeEvidenceText(match[1] ?? ""))
        .filter(Boolean),
    );
  });

  return segments;
}

function extractEvidenceByDocument(item: ReportItem): Map<string, string[]> {
  const references = Array.from(new Set(item.document_references.map((reference) => reference.trim()).filter(Boolean)));
  const referenceKeyMap = new Map(references.map((reference) => [reference.toLowerCase(), reference]));
  const extracted = new Map<string, string[]>();
  const markerRegex = new RegExp(REFERENCE_MARKER_RE);
  const matches = Array.from(item.evidence.matchAll(markerRegex));

  matches.forEach((match, index) => {
    const markerDoc = match[1]?.trim().toLowerCase();
    const documentId = markerDoc ? referenceKeyMap.get(markerDoc) : undefined;
    if (!documentId || match.index === undefined) {
      return;
    }

    const segmentStart = match.index + match[0].length;
    const segmentEnd = index + 1 < matches.length && matches[index + 1].index !== undefined ? matches[index + 1].index : item.evidence.length;
    const segment = item.evidence.slice(segmentStart, segmentEnd);
    const quotes = extractQuotedSegments(segment);
    const normalizedSegment = normalizeEvidenceText(segment.replace(/["“”]/g, ""));
    const fragments = quotes.length > 0 ? quotes : normalizedSegment ? [normalizedSegment] : [];

    if (fragments.length === 0) {
      return;
    }

    const existing = extracted.get(documentId) ?? [];
    const merged = [...existing];
    fragments.forEach((fragment) => {
      if (!merged.includes(fragment)) {
        merged.push(fragment);
      }
    });
    extracted.set(documentId, merged);
  });
  return extracted;
}

function buildReferenceId(documentId: string, segmentIndex: number): string {
  return `${documentId}:${segmentIndex}`;
}

function resolveReferenceId(
  documentId: string,
  evidenceText: string,
  evidenceByDocument: Map<string, string[]>,
): string {
  const normalizedEvidence = normalizeEvidenceText(evidenceText);
  const segments = evidenceByDocument.get(documentId) ?? [];
  const segmentIndex = segments.findIndex((segment) => normalizeEvidenceText(segment) === normalizedEvidence);

  return buildReferenceId(documentId, segmentIndex >= 0 ? segmentIndex : 0);
}

function getCandidateDocumentIds(
  item: ReportItem,
  defaultDocumentId: string,
  documentMap: Record<string, DocumentReference>,
): string[] {
  const references = item.document_references.map((reference) => reference.trim()).filter(Boolean);
  const mappedReferences = references.filter((documentId) => Boolean(documentMap[documentId]));
  const candidateIds = mappedReferences.length > 0 ? mappedReferences : [defaultDocumentId];

  return Array.from(new Set(candidateIds));
}

function toDocumentReference(
  documentId: string,
  documentMap: Record<string, DocumentReference>,
  defaultDocument: DocumentReference,
): DocumentReference {
  const mapped = documentMap[documentId];
  if (mapped) {
    return mapped;
  }

  if (documentId === defaultDocument.document_id) {
    return defaultDocument;
  }

  return {
    document_id: documentId,
    file_name: `${documentId}.pdf`,
    display_name: documentId,
  };
}

function toResolveStatusPriority(status: MatchStatus): number {
  if (status === "resolved_exact") {
    return 3;
  }
  if (status === "resolved_approximate") {
    return 2;
  }
  if (status === "unresolved") {
    return 1;
  }
  return 0;
}

function toGeometryCount(anchor: EvidenceAnchor): number {
  if (anchor.bboxes && anchor.bboxes.length > 0) {
    return anchor.bboxes.length;
  }
  return anchor.bbox ? 1 : 0;
}

function pickBestResolveCandidate(candidates: ResolveCandidate[]): ResolveCandidate {
  return candidates.reduce((best, candidate) => {
    const statusDelta = toResolveStatusPriority(candidate.anchor.status) - toResolveStatusPriority(best.anchor.status);
    if (statusDelta !== 0) {
      return statusDelta > 0 ? candidate : best;
    }

    if (candidate.anchor.match_score !== best.anchor.match_score) {
      return candidate.anchor.match_score > best.anchor.match_score ? candidate : best;
    }

    const geometryDelta = toGeometryCount(candidate.anchor) - toGeometryCount(best.anchor);
    if (geometryDelta !== 0) {
      return geometryDelta > 0 ? candidate : best;
    }

    return candidate.order < best.order ? candidate : best;
  });
}

function toToolbarDocumentOptions(documents: DocumentReference[]): ToolbarDocumentOption[] {
  return documents.map((document) => ({
    documentId: document.document_id,
    label: document.file_name || document.display_name,
  }));
}

function mergeDocumentReferences(base: DocumentReference[], extras: DocumentReference[]): DocumentReference[] {
  const merged = new Map<string, DocumentReference>();
  base.forEach((document) => {
    merged.set(document.document_id, document);
  });
  extras.forEach((document) => {
    if (!merged.has(document.document_id)) {
      merged.set(document.document_id, document);
    }
  });
  return Array.from(merged.values());
}

function toApproximateState(
  item: ReportItem,
  documentMap: Record<string, DocumentReference>,
  defaultDocument: DocumentReference,
): EvidenceWorkspaceState {
  const preferredDocumentId =
    item.document_references.map((reference) => reference.trim()).find((documentId) => Boolean(documentMap[documentId])) ??
    defaultDocument.document_id;
  const documentId = preferredDocumentId;
  const document = documentMap[documentId] ?? defaultDocument;

  return {
    item_id: item.item_id,
    document_id: document.document_id,
    file_name: document.file_name,
    display_name: document.display_name,
    page: estimatePage(item.evidence),
    quote: normalizeQuote(item.evidence),
    bbox: null,
    bboxes: null,
    match_status: "resolved_approximate",
    loading: false,
  };
}

function getClauseKeyword(evidenceText: string): string | undefined {
  // Prefer a leading clause label such as "59.3 ..."; body text may also reference other clauses (e.g. Clause 59.1).
  const leadingClauseMatch = evidenceText.match(/^\s*(?:\([a-z]\)\s*)?(\d{1,3}(?:\.\d+){1,3})(?![\d-])/i);
  if (leadingClauseMatch?.[1]) {
    return leadingClauseMatch[1];
  }

  const sectionMatch = evidenceText.match(/\bSection\s+(\d{1,3}(?:\.\d+){1,3})(?:\([a-z]\))?/i);
  if (sectionMatch?.[1]) {
    return sectionMatch[1];
  }

  const numericClauseMatch = evidenceText.match(/(?:^|[\s"'(])(\d{1,3}(?:\.\d+){1,3})(?![\d-])/);
  if (numericClauseMatch?.[1]) {
    return numericClauseMatch[1];
  }

  const clauseMatch = evidenceText.match(/\bClause\s+(\d{1,3}(?:\.\d+){0,3})\b/i);
  if (clauseMatch?.[1]) {
    return clauseMatch[1];
  }

  return undefined;
}

export default function TenderPage() {
  const [template, setTemplate] = useState<NecTemplatePayload | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [templateError, setTemplateError] = useState("");

  const [reportId, setReportId] = useState("");
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [reportError, setReportError] = useState<string>("");

  const [searchText, setSearchText] = useState("");
  const [reviewTypeFilter, setReviewTypeFilter] = useState<"all" | "consistency" | "compliance">("all");
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);

  const [workspaceState, setWorkspaceState] = useState<EvidenceWorkspaceState>({
    item_id: "N/A",
    document_id: FALLBACK_DOCUMENT.document_id,
    file_name: FALLBACK_DOCUMENT.file_name,
    display_name: FALLBACK_DOCUMENT.display_name,
    page: 1,
    quote: "Pick a card to focus evidence in the workspace.",
    bbox: null,
    bboxes: null,
    match_status: "resolved_approximate",
    loading: false,
  });
  const [activeItemId, setActiveItemId] = useState<string>("");
  const [activeReferenceId, setActiveReferenceId] = useState<string>("");
  const [workspaceDocuments, setWorkspaceDocuments] = useState<DocumentReference[]>([FALLBACK_DOCUMENT]);
  const [switchingDocument, setSwitchingDocument] = useState(false);
  const [isManualViewerMode, setIsManualViewerMode] = useState(false);
  const [viewerPage, setViewerPage] = useState(1);
  const [viewerPageCount, setViewerPageCount] = useState(0);
  const [zoom, setZoom] = useState(125);
  const [fitWidthMode, setFitWidthMode] = useState(true);
  const [exportNotice, setExportNotice] = useState("");
  const autoResolvedReportIdRef = useRef<string>("");

  const standardsCatalog = useMemo(() => template?.standards ?? [], [template]);

  const standardMap = useMemo(() => {
    return new Map(standardsCatalog.map((standard) => [standard.standard_id, standard]));
  }, [standardsCatalog]);

  const defaultDocument = useMemo(() => {
    if (!template || template.documents.length === 0) {
      return FALLBACK_DOCUMENT;
    }
    return template.documents[0];
  }, [template]);

  const documentMap = useMemo(() => toDocumentMap(template), [template]);
  const documentLabels = useMemo(() => {
    const entries = Object.values(documentMap).map((document) => [document.document_id, document.display_name] as const);
    return Object.fromEntries(entries);
  }, [documentMap]);
  const documentFileNames = useMemo(() => {
    const entries = Object.values(documentMap).map((document) => [document.document_id, document.file_name] as const);
    return Object.fromEntries(entries);
  }, [documentMap]);

  const selectedCheckTypes = useMemo(() => {
    const set = new Set<string>();
    selectedOrder.forEach((standardId) => {
      const standard = standardMap.get(standardId);
      if (!standard) {
        return;
      }

      standard.check_types.forEach((checkType) => {
        const normalized = checkType.trim();
        if (normalized) {
          set.add(normalized);
        }
      });
    });
    return set;
  }, [selectedOrder, standardMap]);

  const selectedStandards = useMemo<SelectedStandard[]>(() => {
    return selectedOrder.map((standardId, index) => {
      const standard = standardMap.get(standardId);
      return {
        standard_id: standardId,
        name: standard?.name ?? standardId,
        priority: index + 1,
      };
    });
  }, [selectedOrder, standardMap]);

  const visibleCards = useMemo(() => {
    const keyword = searchText.trim();
    return reportItems.filter((item) => {
      if (selectedOrder.length > 0 && selectedCheckTypes.size > 0 && !selectedCheckTypes.has(item.check_type)) {
        return false;
      }

      const statusDomain = item.status_domain === "compliance" ? "compliance" : "consistency";
      if (reviewTypeFilter !== "all" && statusDomain !== reviewTypeFilter) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return matchesKeywordFuzzySearch(item.keywords, keyword);
    });
  }, [reportItems, reviewTypeFilter, searchText, selectedOrder.length, selectedCheckTypes]);

  useEffect(() => {
    let disposed = false;

    async function bootstrapWorkspace(): Promise<void> {
      setLoadingTemplate(true);
      setTemplateError("");
      setLoadingReport(true);
      setReportError("");

      try {
        const necTemplate = await fetchNecTemplate();
        const defaultOrder = necTemplate.standards
          .slice()
          .sort((a, b) => a.default_priority - b.default_priority)
          .filter((standard) => standard.enabled_by_default)
          .map((standard) => standard.standard_id);

        const ingestResult = await ingestReport({ report_source: "reference_seed", report_items: [] });
        const cardsResult = await fetchReportCards(ingestResult.report_id);

        if (!disposed) {
          const map = toDocumentMap(necTemplate);
          const initialDocument = necTemplate.documents[0] ?? FALLBACK_DOCUMENT;
          const initialWorkspaceDocuments = necTemplate.documents.length > 0 ? necTemplate.documents : [FALLBACK_DOCUMENT];

          setTemplate(necTemplate);
          setWorkspaceDocuments(initialWorkspaceDocuments);
          setSelectedOrder(defaultOrder);
          setReportId(ingestResult.report_id);
          setReportItems(cardsResult.cards);
          setActiveItemId(cardsResult.cards[0]?.item_id ?? "");

          if (cardsResult.cards[0]) {
            setWorkspaceState({
              ...toApproximateState(cardsResult.cards[0], map, initialDocument),
              loading: true,
            });
          }
        }
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : "Failed to load tender workspace data.";
          setTemplateError(message);
          setReportError(message);
          setTemplate(null);
          setReportItems([]);
        }
      } finally {
        if (!disposed) {
          setLoadingTemplate(false);
          setLoadingReport(false);
        }
      }
    }

    void bootstrapWorkspace();

    return () => {
      disposed = true;
    };
  }, []);

  async function focusEvidence(
    item: ReportItem,
    options?: {
      forcedDocumentId?: string;
      evidenceTextOverride?: string;
      referenceId?: string;
      fromDocumentSwitcher?: boolean;
    },
  ): Promise<void> {
    setIsManualViewerMode(false);
    setActiveItemId(item.item_id);

    const evidenceByDocument = extractEvidenceByDocument(item);
    const candidateDocumentIds = getCandidateDocumentIds(item, defaultDocument.document_id, documentMap);
    const candidateDocuments = candidateDocumentIds.map((documentId) =>
      toDocumentReference(documentId, documentMap, defaultDocument),
    );
    const baseWorkspaceDocuments = template?.documents?.length ? template.documents : [defaultDocument];
    setWorkspaceDocuments(mergeDocumentReferences(baseWorkspaceDocuments, candidateDocuments));

    const preferredDocumentId = options?.forcedDocumentId?.trim() || candidateDocumentIds[0];
    const preferredDocument = toDocumentReference(preferredDocumentId, documentMap, defaultDocument);
    const preferredEvidenceSegments = evidenceByDocument.get(preferredDocumentId);
    const preferredEvidence =
      options?.evidenceTextOverride ?? preferredEvidenceSegments?.[0] ?? item.evidence;
    const preferredReferenceId =
      options?.referenceId ?? resolveReferenceId(preferredDocumentId, preferredEvidence, evidenceByDocument);
    setActiveReferenceId(preferredReferenceId);

    const baseState: EvidenceWorkspaceState = {
      ...toApproximateState(item, documentMap, defaultDocument),
      document_id: preferredDocument.document_id,
      file_name: preferredDocument.file_name,
      display_name: preferredDocument.display_name,
      quote: normalizeQuote(preferredEvidence),
      error: undefined,
    };

    if (!reportId) {
      setWorkspaceState(baseState);
      return;
    }

    setWorkspaceState({
      ...baseState,
      loading: true,
    });
    if (options?.fromDocumentSwitcher) {
      setSwitchingDocument(true);
    }

    try {
      const resolveInputs = options?.forcedDocumentId
        ? [{ documentId: preferredDocumentId, evidenceText: preferredEvidence, referenceId: preferredReferenceId }]
        : candidateDocumentIds.flatMap((documentId) => {
            const candidateSegments = evidenceByDocument.get(documentId);
            const evidenceTexts = candidateSegments && candidateSegments.length > 0 ? candidateSegments : [item.evidence];

            return evidenceTexts.map((evidenceText, segmentIndex) => ({
              documentId,
              evidenceText,
              referenceId: buildReferenceId(documentId, segmentIndex),
            }));
          });

      const settled = await Promise.allSettled(
        resolveInputs.map(async ({ documentId, evidenceText, referenceId }, order): Promise<ResolveCandidate> => {
          const clauseKeyword = getClauseKeyword(evidenceText) ?? getClauseKeyword(item.evidence);

          const payload = await resolveEvidence({
            report_id: reportId,
            item_id: item.item_id,
            document_id: documentId,
            evidence_text: evidenceText,
            hints: {
              clause_keyword: clauseKeyword,
            },
          });

          const anchor = payload.anchors[0];
          if (!anchor) {
            throw new Error(`No anchor returned for ${documentId}.`);
          }

          return {
            order,
            document_id: documentId,
            evidence_text: evidenceText,
            reference_id: referenceId,
            anchor,
            payload,
          };
        }),
      );

      const successfulCandidates = settled
        .filter((result): result is PromiseFulfilledResult<ResolveCandidate> => result.status === "fulfilled")
        .map((result) => result.value);

      if (successfulCandidates.length === 0) {
        throw new Error("Evidence resolve failed for all referenced documents.");
      }

      const bestCandidate = pickBestResolveCandidate(successfulCandidates);
      const bestAnchor = bestCandidate.anchor;
      const resolvedDocument = toDocumentReference(bestCandidate.document_id, documentMap, defaultDocument);
      setActiveReferenceId(bestCandidate.reference_id);

      setWorkspaceState({
        item_id: item.item_id,
        document_id: resolvedDocument.document_id,
        file_name: bestCandidate.payload.file_name || resolvedDocument.file_name,
        display_name: resolvedDocument.display_name,
        page: bestAnchor.page,
        quote: bestAnchor.quote || normalizeQuote(bestCandidate.evidence_text),
        bbox: bestAnchor.bbox ?? null,
        bboxes: bestAnchor.bboxes ?? (bestAnchor.bbox ? [bestAnchor.bbox] : null),
        match_status: bestAnchor.status,
        loading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Evidence resolve failed.";
      setActiveReferenceId(preferredReferenceId);
      setWorkspaceState({
        ...baseState,
        loading: false,
        error: message,
      });
    } finally {
      if (options?.fromDocumentSwitcher) {
        setSwitchingDocument(false);
      }
    }
  }

  useEffect(() => {
    if (reportItems.length === 0 || !reportId) {
      return;
    }

    if (autoResolvedReportIdRef.current === reportId) {
      return;
    }

    autoResolvedReportIdRef.current = reportId;
    const firstItem = reportItems[0];
    void focusEvidence(firstItem);
    // Only run when initial report load finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, reportItems]);

  useEffect(() => {
    setViewerPage(Math.max(1, workspaceState.page));
    setFitWidthMode(true);
  }, [workspaceState.document_id, workspaceState.page]);

  useEffect(() => {
    if (viewerPageCount <= 0) {
      return;
    }

    setViewerPage((value) => Math.min(viewerPageCount, Math.max(1, value)));
  }, [viewerPageCount]);

  const handlePageCountChange = useCallback((pageCount: number) => {
    setViewerPageCount(pageCount);
  }, []);

  const toolbarDocumentOptions = useMemo(
    () => toToolbarDocumentOptions(workspaceDocuments),
    [workspaceDocuments],
  );

  const currentToolbarDocumentId = useMemo(() => {
    const activeDocument = workspaceDocuments.find((document) => document.document_id === workspaceState.document_id);
    if (activeDocument) {
      return activeDocument.document_id;
    }
    return workspaceDocuments[0]?.document_id ?? workspaceState.document_id;
  }, [workspaceDocuments, workspaceState.document_id]);

  function handleDocumentChange(documentId: string): void {
    if (documentId === workspaceState.document_id) {
      return;
    }

    const mappedDocument = documentMap[documentId];
    if (!mappedDocument) {
      setWorkspaceState((previous) => ({
        ...previous,
        error: `Document mapping not found: ${documentId}`,
      }));
      return;
    }

    const selectedDocument = mappedDocument;
    setIsManualViewerMode(true);
    setActiveReferenceId("");
    setWorkspaceState((previous) => ({
      ...previous,
      document_id: selectedDocument.document_id,
      file_name: selectedDocument.file_name,
      display_name: selectedDocument.display_name,
      page: 1,
      bbox: null,
      bboxes: null,
      loading: false,
      error: undefined,
    }));
  }

  function openWorkspacePdf(): void {
    if (!workspaceState.document_id || workspaceState.document_id === "unknown") {
      return;
    }

    const url = `/api/documents/${encodeURIComponent(workspaceState.document_id)}/file#page=${viewerPage}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function exportReport(): Promise<void> {
    if (!reportId) {
      setExportNotice("Report is not ready yet.");
      return;
    }

    try {
      const { blob, fileName } = await exportReportFile({
        report_id: reportId,
        format: "docx",
        selected_standards: selectedStandards,
        card_ids: visibleCards.map((item) => item.item_id),
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);

      setExportNotice("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed.";
      setExportNotice(message);
    }
  }

  async function saveManualReview(item: ReportItem, payload: ManualReviewUpdatePayload): Promise<void> {
    if (!reportId) {
      throw new Error("Report is not ready yet.");
    }

    const result = await updateManualReview(reportId, item.item_id, payload);
    setReportItems((previous) =>
      previous.map((card) => (card.item_id === result.item.item_id ? result.item : card)),
    );
  }

  async function updateManualReviewHistory(item: ReportItem, historyId: string, payload: ManualReviewUpdatePayload): Promise<void> {
    if (!reportId) {
      throw new Error("Report is not ready yet.");
    }

    const result = await updateManualReviewHistoryEntry(reportId, item.item_id, historyId, payload);
    setReportItems((previous) =>
      previous.map((card) => (card.item_id === result.item.item_id ? result.item : card)),
    );
  }

  async function deleteManualReviewHistory(item: ReportItem, historyId: string): Promise<void> {
    if (!reportId) {
      throw new Error("Report is not ready yet.");
    }

    const result = await deleteManualReviewHistoryEntry(reportId, item.item_id, historyId);
    setReportItems((previous) =>
      previous.map((card) => (card.item_id === result.item.item_id ? result.item : card)),
    );
  }

  const templateName = template?.name ?? "N/A";

  return (
    <TenderAppShell
      actions={
        <>
          <button className="c-btn c-btn-secondary" type="button" disabled title="Temporarily unavailable">
            Admin Settings
          </button>
          <button className="c-btn c-btn-primary" type="button" onClick={() => void exportReport()}>
            Output Report
          </button>
        </>
      }
      sidebar={
        <div className="c-sidebar-stack">
          <section className="c-section">
            <div className="c-section-header">
              <div>
                <h2 className="c-section-title">Evaluation Scope</h2>
                <p className="c-section-desc">
                  This section lists the standards and priority levels used to generate this report.
                </p>
              </div>
            </div>
            {loadingTemplate ? <p className="c-empty">Loading evaluation standards...</p> : null}
            {templateError ? <p className="c-alert">Unable to load evaluation settings right now.</p> : null}
            {template && !templateError ? (
              <>
                <p className="c-notice">Standard set: {templateName}</p>
                <div className="c-card-meta" style={{ marginTop: "12px" }}>
                  {selectedStandards.map((standard) => (
                    <span key={standard.standard_id} className="c-chip">
                      Priority {standard.priority} {standard.name}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <section className="c-section">
            <div className="c-section-header">
              <div>
                <h2 className="c-section-title">Report Cards</h2>
                <p className="c-section-desc">
                  Click evidence to auto-resolve across referenced documents and update PDF highlight.
                </p>
              </div>
              <span className="c-badge">{visibleCards.length} cards</span>
            </div>

            <div className="c-card-filters">
              <input
                className="c-search-input"
                type="search"
                value={searchText}
                placeholder="Search cards by keywords..."
                onChange={(event) => setSearchText(event.target.value)}
              />
              <select
                className="c-select-input"
                value={reviewTypeFilter}
                aria-label="Filter cards by review type"
                onChange={(event) => setReviewTypeFilter(event.target.value as "all" | "consistency" | "compliance")}
              >
                <option value="all">All Review Types</option>
                <option value="consistency">Consistency Review</option>
                <option value="compliance">Compliance Review</option>
              </select>
            </div>

            {loadingReport ? <p className="c-empty">Loading report cards...</p> : null}
            {reportError ? <p className="c-alert">{reportError}</p> : null}
            {!loadingReport && !reportError && visibleCards.length === 0 ? (
              <p className="c-empty">No cards match the current filters or search text.</p>
            ) : null}

            <div className="c-card-list">
              {visibleCards.map((item) => (
                <ComplianceCard
                  key={item.item_id}
                  item={item}
                  isActive={item.item_id === activeItemId}
                  reportId={reportId}
                  activeDocumentId={
                    item.item_id === activeItemId && !isManualViewerMode ? workspaceState.document_id : undefined
                  }
                  activeReferenceId={item.item_id === activeItemId && !isManualViewerMode ? activeReferenceId : undefined}
                  documentLabels={documentLabels}
                  documentFileNames={documentFileNames}
                  onEvidenceClick={(card, options) => void focusEvidence(card, options)}
                  onSaveManualReview={(card, payload) => saveManualReview(card, payload)}
                  onUpdateManualReviewHistory={(card, historyId, payload) =>
                    updateManualReviewHistory(card, historyId, payload)
                  }
                  onDeleteManualReviewHistory={(card, historyId) => deleteManualReviewHistory(card, historyId)}
                />
              ))}
            </div>
          </section>

          {exportNotice ? <p className="c-notice">{exportNotice}</p> : null}
        </div>
      }
      workspace={
        <>
          <WorkspaceToolbar
            fileName={workspaceState.file_name}
            currentDocumentId={currentToolbarDocumentId}
            documentOptions={toolbarDocumentOptions}
            currentPage={viewerPage}
            pageCount={viewerPageCount}
            isDocumentSwitching={switchingDocument || workspaceState.loading}
            onDocumentChange={handleDocumentChange}
            onOpenDocument={openWorkspacePdf}
          />
          <PdfWorkspace
            documentId={workspaceState.document_id}
            currentPage={viewerPage}
            highlightPage={workspaceState.page}
            bbox={workspaceState.bbox}
            bboxes={workspaceState.bboxes ?? null}
            zoom={zoom}
            fitWidth={fitWidthMode}
            isLoading={workspaceState.loading}
            errorMessage={workspaceState.error}
            onPageCountChange={handlePageCountChange}
          />
          <WorkspaceBottomBar
            currentPage={viewerPage}
            pageCount={viewerPageCount}
            zoom={zoom}
            fitWidth={fitWidthMode}
            onPrevPage={() => setViewerPage((value) => Math.max(1, value - 1))}
            onNextPage={() =>
              setViewerPage((value) => {
                const next = value + 1;
                if (viewerPageCount > 0) {
                  return Math.min(viewerPageCount, next);
                }
                return next;
              })
            }
            onPageChange={(page) =>
              setViewerPage(() => {
                const normalized = Math.max(1, Math.floor(page));
                if (viewerPageCount > 0) {
                  return Math.min(viewerPageCount, normalized);
                }
                return normalized;
              })
            }
            onFitWidth={() => setFitWidthMode(true)}
            onZoomIn={() => {
              setFitWidthMode(false);
              setZoom((value) => Math.min(220, value + 10));
            }}
            onZoomOut={() => {
              setFitWidthMode(false);
              setZoom((value) => Math.max(60, value - 10));
            }}
          />
        </>
      }
    />
  );
}
