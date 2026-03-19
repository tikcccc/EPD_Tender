"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { TenderAppShell } from "@/components/layout/TenderAppShell";
import { PdfWorkspace } from "@/components/pdf/PdfWorkspace";
import { ComplianceCard } from "@/components/report/ComplianceCard";
import { WorkspaceBottomBar } from "@/components/toolbar/WorkspaceBottomBar";
import { WorkspaceToolbar } from "@/components/toolbar/WorkspaceToolbar";
import {
  deleteManualReviewHistoryEntry,
  exportReportFile,
  fetchReportCards,
  fetchWorkspaceProjectsConfig,
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
  ReportItem,
  ResolveEvidenceResult,
  Severity,
  SelectedStandard,
  WorkspaceProjectConfig,
  WorkspaceProjectsConfig,
} from "@/features/tender-ui/types";

const CARD_PAGE_SIZE = 50;
const EXPORT_CARD_PAGE_SIZE = 200;
const FALLBACK_DOCUMENT: DocumentReference = {
  document_id: "unknown",
  file_name: "unknown.pdf",
  display_name: "Unknown Document",
};
const REFERENCE_MARKER_RE = /from\s+(?:document\s+)?([a-z0-9._() -]+?)(?:\s*,[^:\n]+)?\s*:/gi;
const QUOTED_SEGMENT_PATTERNS = [/"([^"]+)"/g, /“([^”]+)”/g];
const SEVERITY_ORDER: Severity[] = ["major", "minor", "info"];
const SEVERITY_LABELS: Record<Severity, string> = {
  major: "Major",
  minor: "Minor",
  info: "Info",
};
type ReviewTypeFilter = "all" | "consistency" | "compliance";
type StatusFilterValue =
  | "all"
  | "consistent"
  | "inconsistent"
  | "compliant"
  | "non_compliant"
  | "unknown"
  | "modified"
  | "not_found"
  | "uncertain";

const STATUS_FILTER_OPTIONS: Array<{
  value: StatusFilterValue;
  label: string;
  reviewTypes: ReviewTypeFilter[];
}> = [
  { value: "all", label: "All Statuses", reviewTypes: ["all", "consistency", "compliance"] },
  { value: "consistent", label: "Consistent", reviewTypes: ["all", "consistency"] },
  { value: "inconsistent", label: "Inconsistent", reviewTypes: ["all", "consistency"] },
  { value: "compliant", label: "Compliant", reviewTypes: ["all", "compliance"] },
  { value: "non_compliant", label: "Non-compliant", reviewTypes: ["all", "compliance"] },
  { value: "unknown", label: "Unknown", reviewTypes: ["all", "consistency", "compliance"] },
  { value: "modified", label: "Modified", reviewTypes: ["all", "consistency", "compliance"] },
  { value: "not_found", label: "Not Found", reviewTypes: ["all", "consistency", "compliance"] },
  { value: "uncertain", label: "Uncertain", reviewTypes: ["all", "consistency", "compliance"] },
];

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

function toDocumentMap(project: WorkspaceProjectConfig | null): Record<string, DocumentReference> {
  if (!project) {
    return {};
  }
  return Object.fromEntries(project.documents.map((document) => [document.document_id, document]));
}

function normalizeEvidenceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatCheckTypeLabel(checkType: string): string {
  const normalized = checkType.trim();
  if (!normalized) {
    return "N/A";
  }

  return normalized
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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
    const segmentEnd =
      index + 1 < matches.length && matches[index + 1].index !== undefined
        ? matches[index + 1].index
        : item.evidence.length;
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

function getDefaultSelectedOrder(project: WorkspaceProjectConfig | null): string[] {
  if (!project) {
    return [];
  }

  const template = project.templates.find((item) => item.template_id === project.default_template_id);
  if (template) {
    return template.standards
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((entry) => entry.standard_id);
  }

  return project.standards_catalog
    .slice()
    .sort((a, b) => a.default_priority - b.default_priority)
    .filter((standard) => standard.enabled_by_default)
    .map((standard) => standard.standard_id);
}

function getTemplateName(project: WorkspaceProjectConfig | null): string {
  if (!project) {
    return "N/A";
  }

  const template = project.templates.find((item) => item.template_id === project.default_template_id);
  return template?.name ?? project.name;
}

function createIdleWorkspaceState(document: DocumentReference): EvidenceWorkspaceState {
  return {
    item_id: "N/A",
    document_id: document.document_id,
    file_name: document.file_name,
    display_name: document.display_name,
    page: 1,
    quote: "Pick a card to focus evidence in the workspace.",
    bbox: null,
    bboxes: null,
    match_status: "resolved_approximate",
    loading: false,
  };
}

export default function TenderPage() {
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceProjectsConfig | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [templateError, setTemplateError] = useState("");
  const [activeProjectId, setActiveProjectId] = useState("");

  const [reportId, setReportId] = useState("");
  const [reportItems, setReportItems] = useState<ReportItem[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [reportError, setReportError] = useState<string>("");
  const [cardsPage, setCardsPage] = useState(1);
  const [totalCards, setTotalCards] = useState(0);

  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [reviewTypeFilter, setReviewTypeFilter] = useState<ReviewTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [evaluationScopeExpanded, setEvaluationScopeExpanded] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string[]>([]);

  const [workspaceState, setWorkspaceState] = useState<EvidenceWorkspaceState>(createIdleWorkspaceState(FALLBACK_DOCUMENT));
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
  const requestKeyRef = useRef("");

  const activeProject = useMemo(() => {
    return workspaceConfig?.projects.find((project) => project.project_id === activeProjectId) ?? null;
  }, [activeProjectId, workspaceConfig]);
  const standardsCatalog = useMemo(() => activeProject?.standards_catalog ?? [], [activeProject]);

  const standardMap = useMemo(() => {
    return new Map(standardsCatalog.map((standard) => [standard.standard_id, standard]));
  }, [standardsCatalog]);

  const defaultDocument = useMemo(() => {
    if (!activeProject || activeProject.documents.length === 0) {
      return FALLBACK_DOCUMENT;
    }
    return activeProject.documents[0];
  }, [activeProject]);

  const documentMap = useMemo(() => toDocumentMap(activeProject), [activeProject]);
  const documentLabels = useMemo(() => {
    const entries = Object.values(documentMap).map((document) => [document.document_id, document.display_name] as const);
    return Object.fromEntries(entries);
  }, [documentMap]);
  const documentFileNames = useMemo(() => {
    const entries = Object.values(documentMap).map((document) => [document.document_id, document.file_name] as const);
    return Object.fromEntries(entries);
  }, [documentMap]);

  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    standardsCatalog.forEach((standard) => {
      standard.check_types.forEach((checkType) => {
        const normalized = checkType.trim();
        if (!normalized) {
          return;
        }

        const domains = standard.check_type_domains?.[normalized] ?? ["consistency"];
        if (reviewTypeFilter !== "all" && !domains.includes(reviewTypeFilter)) {
          return;
        }

        categories.add(normalized);
      });
    });
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [reviewTypeFilter, standardsCatalog]);
  const statusOptions = useMemo(() => {
    return STATUS_FILTER_OPTIONS.filter((option) => option.reviewTypes.includes(reviewTypeFilter));
  }, [reviewTypeFilter]);

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

  const totalPages = Math.max(1, Math.ceil(totalCards / CARD_PAGE_SIZE));

  useEffect(() => {
    let disposed = false;

    async function loadWorkspaceConfig(): Promise<void> {
      setLoadingTemplate(true);
      setTemplateError("");

      try {
        const config = await fetchWorkspaceProjectsConfig();
        if (!disposed) {
          setWorkspaceConfig(config);
          setActiveProjectId(config.default_project_id);
        }
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : "Failed to load workspace configuration.";
          setTemplateError(message);
          setWorkspaceConfig(null);
          setLoadingReport(false);
        }
      } finally {
        if (!disposed) {
          setLoadingTemplate(false);
        }
      }
    }

    void loadWorkspaceConfig();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    setCardsPage(1);
  }, [activeProjectId, searchText, reviewTypeFilter, statusFilter, categoryFilter, severityFilter]);

  useEffect(() => {
    if (categoryFilter === "all") {
      return;
    }

    if (categoryOptions.includes(categoryFilter)) {
      return;
    }

    setCategoryFilter("all");
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    if (statusFilter === "all") {
      return;
    }

    if (statusOptions.some((option) => option.value === statusFilter)) {
      return;
    }

    setStatusFilter("all");
  }, [statusFilter, statusOptions]);

  useEffect(() => {
    if (!activeProject) {
      return;
    }

    const currentProject = activeProject;
    let disposed = false;
    const baseDocuments = currentProject.documents.length > 0 ? currentProject.documents : [FALLBACK_DOCUMENT];

    async function bootstrapProject(): Promise<void> {
      setReportError("");
      setLoadingReport(true);
      setReportId("");
      setReportItems([]);
      setTotalCards(0);
      setCardsPage(1);
      setSearchText("");
      setReviewTypeFilter("all");
      setStatusFilter("all");
      setCategoryFilter("all");
      setSeverityFilter("all");
      setSelectedOrder(getDefaultSelectedOrder(currentProject));
      setWorkspaceDocuments(baseDocuments);
      setActiveItemId("");
      setActiveReferenceId("");
      setIsManualViewerMode(false);
      setSwitchingDocument(false);
      setWorkspaceState(createIdleWorkspaceState(baseDocuments[0] ?? FALLBACK_DOCUMENT));
      setExportNotice("");
      requestKeyRef.current = "";

      try {
        const ingestResult = await ingestReport({
          project_id: currentProject.project_id,
          report_source: "reference_seed",
          report_items: [],
        });

        if (!disposed) {
          setReportId(ingestResult.report_id);
        }
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : "Failed to initialize project report.";
          setReportError(message);
          setLoadingReport(false);
        }
      }
    }

    void bootstrapProject();

    return () => {
      disposed = true;
    };
  }, [activeProject]);

  const focusEvidence = useCallback(
    async (
      item: ReportItem,
      options?: {
        forcedDocumentId?: string;
        evidenceTextOverride?: string;
        referenceId?: string;
        fromDocumentSwitcher?: boolean;
      },
    ): Promise<void> => {
      setIsManualViewerMode(false);
      setActiveItemId(item.item_id);

      const evidenceByDocument = extractEvidenceByDocument(item);
      const candidateDocumentIds = getCandidateDocumentIds(item, defaultDocument.document_id, documentMap);
      const candidateDocuments = candidateDocumentIds.map((documentId) =>
        toDocumentReference(documentId, documentMap, defaultDocument),
      );
      const baseWorkspaceDocuments = activeProject?.documents?.length ? activeProject.documents : [defaultDocument];
      setWorkspaceDocuments(mergeDocumentReferences(baseWorkspaceDocuments, candidateDocuments));

      const preferredDocumentId = options?.forcedDocumentId?.trim() || candidateDocumentIds[0];
      const preferredDocument = toDocumentReference(preferredDocumentId, documentMap, defaultDocument);
      const preferredEvidenceSegments = evidenceByDocument.get(preferredDocumentId);
      const preferredEvidence = options?.evidenceTextOverride ?? preferredEvidenceSegments?.[0] ?? item.evidence;
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
    },
    [activeProject, defaultDocument, documentMap, reportId],
  );

  useEffect(() => {
    if (!reportId || !activeProject) {
      return;
    }

    const currentProject = activeProject;
    let disposed = false;
    const requestKey = [
      reportId,
      cardsPage,
      CARD_PAGE_SIZE,
      deferredSearchText.trim(),
      categoryFilter,
      severityFilter,
      reviewTypeFilter,
    ].join("|");
    requestKeyRef.current = requestKey;

    async function loadCards(): Promise<void> {
      setLoadingReport(true);
      setReportError("");

      try {
        const result = await fetchReportCards(reportId, {
          page: cardsPage,
          pageSize: CARD_PAGE_SIZE,
          q: deferredSearchText.trim() || undefined,
          checkType: categoryFilter,
          severity: severityFilter,
          status: statusFilter,
          reviewType: reviewTypeFilter,
        });

        if (disposed || requestKeyRef.current !== requestKey) {
          return;
        }

        setReportItems(result.cards);
        setTotalCards(result.total);

        const baseDocuments = currentProject.documents.length > 0 ? currentProject.documents : [FALLBACK_DOCUMENT];
        setWorkspaceDocuments(baseDocuments);

        if (result.cards.length > 0) {
          void focusEvidence(result.cards[0]);
        } else {
          setActiveItemId("");
          setActiveReferenceId("");
          setWorkspaceState(createIdleWorkspaceState(baseDocuments[0] ?? FALLBACK_DOCUMENT));
        }
      } catch (error) {
        if (!disposed && requestKeyRef.current === requestKey) {
          const message = error instanceof Error ? error.message : "Failed to load report cards.";
          setReportError(message);
          setReportItems([]);
          setTotalCards(0);
        }
      } finally {
        if (!disposed && requestKeyRef.current === requestKey) {
          setLoadingReport(false);
        }
      }
    }

    void loadCards();

    return () => {
      disposed = true;
    };
  }, [activeProject, cardsPage, categoryFilter, deferredSearchText, focusEvidence, reportId, reviewTypeFilter, severityFilter, statusFilter]);

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

  const toolbarDocumentOptions = useMemo(() => toToolbarDocumentOptions(workspaceDocuments), [workspaceDocuments]);

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

    setIsManualViewerMode(true);
    setActiveReferenceId("");
    setWorkspaceState((previous) => ({
      ...previous,
      document_id: mappedDocument.document_id,
      file_name: mappedDocument.file_name,
      display_name: mappedDocument.display_name,
      page: 1,
      bbox: null,
      bboxes: null,
      loading: false,
      error: undefined,
    }));
  }

  function openWorkspacePdf(): void {
    if (!activeProjectId || !workspaceState.document_id || workspaceState.document_id === "unknown") {
      return;
    }

    const url = `/api/projects/${encodeURIComponent(activeProjectId)}/documents/${encodeURIComponent(workspaceState.document_id)}/file#page=${viewerPage}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function collectFilteredCardIds(): Promise<string[]> {
    if (!reportId) {
      return [];
    }

    const cardIds: string[] = [];
    let page = 1;

    while (true) {
      const result = await fetchReportCards(reportId, {
        page,
        pageSize: EXPORT_CARD_PAGE_SIZE,
        q: deferredSearchText.trim() || undefined,
        checkType: categoryFilter,
        severity: severityFilter,
        status: statusFilter,
        reviewType: reviewTypeFilter,
      });

      cardIds.push(...result.cards.map((item) => item.item_id));
      if (cardIds.length >= result.total || result.cards.length === 0) {
        break;
      }
      page += 1;
    }

    return cardIds;
  }

  async function exportReport(): Promise<void> {
    if (!reportId) {
      setExportNotice("Report is not ready yet.");
      return;
    }

    try {
      const cardIds = await collectFilteredCardIds();
      const { blob, fileName } = await exportReportFile({
        report_id: reportId,
        format: "docx",
        selected_standards: selectedStandards,
        card_ids: cardIds,
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
    setReportItems((previous) => previous.map((card) => (card.item_id === result.item.item_id ? result.item : card)));
  }

  async function updateManualReviewHistory(item: ReportItem, historyId: string, payload: ManualReviewUpdatePayload): Promise<void> {
    if (!reportId) {
      throw new Error("Report is not ready yet.");
    }

    const result = await updateManualReviewHistoryEntry(reportId, item.item_id, historyId, payload);
    setReportItems((previous) => previous.map((card) => (card.item_id === result.item.item_id ? result.item : card)));
  }

  async function deleteManualReviewHistory(item: ReportItem, historyId: string): Promise<void> {
    if (!reportId) {
      throw new Error("Report is not ready yet.");
    }

    const result = await deleteManualReviewHistoryEntry(reportId, item.item_id, historyId);
    setReportItems((previous) => previous.map((card) => (card.item_id === result.item.item_id ? result.item : card)));
  }

  const templateName = getTemplateName(activeProject);

  return (
    <TenderAppShell
      subtitle={activeProject ? `Project: ${activeProject.name}` : undefined}
      actions={
        <>
          <label className="c-topbar-project-picker">
            <span className="c-topbar-project-label">Project</span>
            <select
              className="c-select-input c-topbar-project-select"
              value={activeProjectId}
              disabled={loadingTemplate || loadingReport || !workspaceConfig}
              onChange={(event) => setActiveProjectId(event.target.value)}
              aria-label="Switch project"
            >
              {(workspaceConfig?.projects ?? []).map((project) => (
                <option key={project.project_id} value={project.project_id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
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
            <div className={`c-section-header${evaluationScopeExpanded ? "" : " is-collapsed"}`}>
              <div>
                <h2 className="c-section-title">Evaluation Scope</h2>
                <p className="c-section-desc">
                  This section lists the standards and priority levels used to generate this report.
                </p>
              </div>
              <button
                className="c-link-btn c-review-toggle"
                type="button"
                onClick={() => setEvaluationScopeExpanded((value) => !value)}
                aria-expanded={evaluationScopeExpanded}
                aria-controls="evaluation-scope-panel"
              >
                {evaluationScopeExpanded ? "Collapse" : "Expand"}
                <span className={`c-review-toggle-chevron${evaluationScopeExpanded ? " is-open" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </button>
            </div>
            {evaluationScopeExpanded ? (
              <div id="evaluation-scope-panel">
                {loadingTemplate ? <p className="c-empty">Loading evaluation standards...</p> : null}
                {templateError ? <p className="c-alert">{templateError}</p> : null}
                {activeProject && !templateError ? (
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
              </div>
            ) : null}
          </section>

          <section className="c-section c-report-section">
            <div className="c-section-header">
              <div>
                <h2 className="c-section-title">Report Cards</h2>
                <p className="c-section-desc">
                  Search and filter results server-side, then click evidence to resolve against project documents.
                </p>
              </div>
              <span className="c-badge">{totalCards.toLocaleString()} cards</span>
            </div>

            <div className="c-report-section-body">
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
                  onChange={(event) => setReviewTypeFilter(event.target.value as ReviewTypeFilter)}
                >
                  <option value="all">All Review Types</option>
                  <option value="consistency">Consistency Review</option>
                  <option value="compliance">Compliance Review</option>
                </select>
                <select
                  className="c-select-input"
                  value={categoryFilter}
                  aria-label="Filter cards by category"
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All Categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {formatCheckTypeLabel(category)}
                    </option>
                  ))}
                </select>
                <select
                  className="c-select-input"
                  value={statusFilter}
                  aria-label="Filter cards by status"
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilterValue)}
                >
                  {statusOptions.map((statusOption) => (
                    <option key={statusOption.value} value={statusOption.value}>
                      {statusOption.label}
                    </option>
                  ))}
                </select>
                <select
                  className="c-select-input"
                  value={severityFilter}
                  aria-label="Filter cards by severity"
                  onChange={(event) => setSeverityFilter(event.target.value as "all" | Severity)}
                >
                  <option value="all">All Severities</option>
                  {SEVERITY_ORDER.map((severity) => (
                    <option key={severity} value={severity}>
                      {SEVERITY_LABELS[severity]}
                    </option>
                  ))}
                </select>
              </div>

              {loadingReport ? <p className="c-empty">Loading report cards...</p> : null}
              {reportError ? <p className="c-alert">{reportError}</p> : null}
              {!loadingReport && !reportError && reportItems.length === 0 ? (
                <p className="c-empty">No cards match the current filters or search text.</p>
              ) : null}

              <div className="c-card-list">
                {reportItems.map((item) => (
                  <ComplianceCard
                    key={item.item_id}
                    item={item}
                    isActive={item.item_id === activeItemId}
                    reportId={reportId}
                    activeDocumentId={item.item_id === activeItemId && !isManualViewerMode ? workspaceState.document_id : undefined}
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

              {totalCards > 0 ? (
                <div className="c-card-pagination">
                  <span className="c-card-pagination-meta">
                    Page {cardsPage} / {totalPages}
                  </span>
                  <div className="c-card-pagination-actions">
                    <button
                      className="c-btn c-btn-secondary"
                      type="button"
                      onClick={() => setCardsPage((value) => Math.max(1, value - 1))}
                      disabled={cardsPage <= 1 || loadingReport}
                    >
                      Previous Page
                    </button>
                    <button
                      className="c-btn c-btn-secondary"
                      type="button"
                      onClick={() => setCardsPage((value) => Math.min(totalPages, value + 1))}
                      disabled={cardsPage >= totalPages || loadingReport}
                    >
                      Next Page
                    </button>
                  </div>
                </div>
              ) : null}
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
            projectId={activeProjectId}
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
