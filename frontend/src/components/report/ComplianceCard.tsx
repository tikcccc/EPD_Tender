import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EvidenceReferenceList } from "@/components/report/EvidenceReferenceList";
import { fetchManualReviewHistory } from "@/features/tender-ui/api-client";
import type {
  ManualReviewHistoryEntry,
  ManualReviewUpdatePayload,
  ManualVerdict,
  ManualVerdictCategory,
  ReportItem,
  StatusDomain,
} from "@/features/tender-ui/types";

type ComplianceCardProps = {
  item: ReportItem;
  isActive: boolean;
  reportId?: string;
  activeDocumentId?: string;
  activeReferenceId?: string;
  documentLabels: Record<string, string>;
  documentFileNames: Record<string, string>;
  onEvidenceClick: (
    item: ReportItem,
    options?: {
      forcedDocumentId?: string;
      evidenceTextOverride?: string;
      referenceId?: string;
    },
  ) => void;
  onSaveManualReview: (item: ReportItem, payload: ManualReviewUpdatePayload) => Promise<void>;
  onUpdateManualReviewHistory: (
    item: ReportItem,
    historyId: string,
    payload: ManualReviewUpdatePayload,
  ) => Promise<void>;
  onDeleteManualReviewHistory: (item: ReportItem, historyId: string) => Promise<void>;
};

const REFERENCE_PREVIEW_LIMIT = 120;
const REFERENCE_MARKER_RE = /from\s+(?:document\s+)?([a-z0-9._-]+)(?:\s*,[^:\n]+)?\s*:/gi;
const QUOTED_SEGMENT_PATTERNS = [/"([^"]+)"/g, /“([^”]+)”/g];
const MANUAL_NOTE_MAX_LENGTH = 1000;
const MANUAL_HISTORY_PAGE_SIZE = 5;
const MANUAL_REVIEW_NOTICE_AUTO_HIDE_MS = 2500;
const MANUAL_REVIEW_ERROR_AUTO_HIDE_MS = 3000;
const REVIEW_TITLE_BY_DOMAIN_STATUS: Record<StatusDomain, Record<ReportItem["consistency_status"], string>> = {
  consistency: {
    consistent: "Consistency Review",
    inconsistent: "Inconsistency Review",
    unknown: "Consistency Review",
  },
  compliance: {
    consistent: "Compliance Review",
    inconsistent: "Non-compliance Review",
    unknown: "Compliance Review",
  },
};
const STATUS_LABEL_BY_DOMAIN_STATUS: Record<StatusDomain, Record<ReportItem["consistency_status"], string>> = {
  consistency: {
    consistent: "Consistent",
    inconsistent: "Inconsistent",
    unknown: "Unknown",
  },
  compliance: {
    consistent: "Compliant",
    inconsistent: "Non-compliant",
    unknown: "Unknown",
  },
};

const MANUAL_VERDICT_OPTIONS: Array<{ value: ManualVerdict; label: string }> = [
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "needs_followup", label: "Needs Follow-up" },
];

const MANUAL_CATEGORY_OPTIONS: Array<{ value: ManualVerdictCategory; label: string }> = [
  { value: "evidence_gap", label: "Evidence Gap" },
  { value: "rule_dispute", label: "Rule Dispute" },
  { value: "false_positive", label: "False Positive" },
  { value: "data_issue", label: "Data Issue" },
  { value: "other", label: "Other" },
];

type HistoryEditTarget = {
  history_id: string;
  edited_at: string;
  manual_verdict: ManualVerdict | null;
  manual_verdict_category: ManualVerdictCategory | null;
  manual_verdict_note: string | null;
};

function toManualOptionLabel(
  value: string,
  options: Array<{ value: string; label: string }>,
  fallback: string,
): string {
  const matched = options.find((option) => option.value === value);
  return matched?.label ?? fallback;
}

function formatManualReviewTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return parsed.toLocaleString();
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

function extractReferenceEvidenceByDocument(item: ReportItem): Map<string, string[]> {
  const references = Array.from(new Set(item.document_references.map((reference) => reference.trim()).filter(Boolean)));
  const referenceKeyMap = new Map(references.map((reference) => [reference.toLowerCase(), reference]));
  const extractedMap = new Map<string, string[]>();
  const markerRegex = new RegExp(REFERENCE_MARKER_RE);
  const matches = Array.from(item.evidence.matchAll(markerRegex));

  matches.forEach((match, index) => {
    const sourceKey = match[1]?.trim().toLowerCase();
    const documentId = sourceKey ? referenceKeyMap.get(sourceKey) : undefined;
    if (!documentId || match.index === undefined) {
      return;
    }

    const segmentStart = match.index + match[0].length;
    const segmentEnd = index + 1 < matches.length && matches[index + 1].index !== undefined ? matches[index + 1].index : item.evidence.length;
    const segment = item.evidence.slice(segmentStart, segmentEnd);
    const quotedPieces = extractQuotedSegments(segment);
    const normalizedSegment = normalizeEvidenceText(segment.replace(/["“”]/g, ""));
    const fragments = quotedPieces.length > 0 ? quotedPieces : normalizedSegment ? [normalizedSegment] : [];

    if (fragments.length === 0) {
      return;
    }

    const existing = extractedMap.get(documentId) ?? [];
    const merged = [...existing];
    fragments.forEach((fragment) => {
      if (!merged.includes(fragment)) {
        merged.push(fragment);
      }
    });
    extractedMap.set(documentId, merged);
  });
  return extractedMap;
}

export function ComplianceCard({
  item,
  isActive,
  reportId,
  activeDocumentId,
  activeReferenceId,
  documentLabels,
  documentFileNames,
  onEvidenceClick,
  onSaveManualReview,
  onUpdateManualReviewHistory,
  onDeleteManualReviewHistory,
}: ComplianceCardProps) {
  const normalizedEvidence = item.evidence.replace(/\s+/g, " ").trim();
  const severityLabel = `${item.severity.charAt(0).toUpperCase()}${item.severity.slice(1)}`;
  const confidenceLabel = item.confidence_score.toFixed(2);
  const statusDomain: StatusDomain = item.status_domain === "compliance" ? "compliance" : "consistency";
  const consistencyLabel = STATUS_LABEL_BY_DOMAIN_STATUS[statusDomain][item.consistency_status] ?? "Unknown";
  const reviewTitle = REVIEW_TITLE_BY_DOMAIN_STATUS[statusDomain][item.consistency_status] ?? "Consistency Review";
  const checkTypeLabel = useMemo(() => formatCheckTypeLabel(item.check_type), [item.check_type]);
  const evidenceByDocument = useMemo(() => extractReferenceEvidenceByDocument(item), [item]);
  const referenceItems = useMemo(() => {
    const references = Array.from(new Set(item.document_references.map((reference) => reference.trim()).filter(Boolean)));
    const effectiveReferences = references.length > 0 ? references : ["unknown"];

    return effectiveReferences.flatMap((documentId) => {
      const evidenceSegments = evidenceByDocument.get(documentId);
      const effectiveEvidence = evidenceSegments && evidenceSegments.length > 0 ? evidenceSegments : [normalizedEvidence];
      const displayName = documentLabels[documentId] ?? documentId;
      const fileName = documentFileNames[documentId] ?? `${documentId}.pdf`;

      return effectiveEvidence.map((evidenceText, segmentIndex) => {
        const preview =
          evidenceText.length > REFERENCE_PREVIEW_LIMIT
            ? `${evidenceText.slice(0, REFERENCE_PREVIEW_LIMIT).trimEnd()}...`
            : evidenceText;
        const segmentSuffix = effectiveEvidence.length > 1 ? ` [${segmentIndex + 1}]` : "";
        const referenceId = `${documentId}:${segmentIndex}`;
        const isReferenceActive = activeReferenceId
          ? activeReferenceId === referenceId
          : activeDocumentId === documentId && segmentIndex === 0;

        return {
          id: referenceId,
          documentId,
          label: `${fileName} (${displayName})${segmentSuffix}`,
          preview,
          evidenceText,
          isActive: isReferenceActive,
        };
      });
    });
  }, [activeDocumentId, activeReferenceId, documentFileNames, documentLabels, evidenceByDocument, item.document_references, normalizedEvidence]);

  const [manualVerdict, setManualVerdict] = useState(item.manual_verdict ?? "");
  const [manualCategory, setManualCategory] = useState(item.manual_verdict_category ?? "");
  const [manualNote, setManualNote] = useState(item.manual_verdict_note ?? "");
  const [savingManualReview, setSavingManualReview] = useState(false);
  const [manualReviewError, setManualReviewError] = useState("");
  const [manualReviewNotice, setManualReviewNotice] = useState("");
  const [manualReviewExpanded, setManualReviewExpanded] = useState(false);
  const [manualReviewTab, setManualReviewTab] = useState<"edit" | "history">("edit");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyEntries, setHistoryEntries] = useState<ManualReviewHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyEditTarget, setHistoryEditTarget] = useState<HistoryEditTarget | null>(null);
  const [savingHistoryEdit, setSavingHistoryEdit] = useState(false);
  const [deletingHistoryId, setDeletingHistoryId] = useState("");
  const [remarkPopoverOpen, setRemarkPopoverOpen] = useState(false);
  const [remarkPopoverPinned, setRemarkPopoverPinned] = useState(false);
  const previousItemIdRef = useRef(item.item_id);
  const skipNextManualNoteSyncRef = useRef(false);
  const remarkPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const switchedItem = previousItemIdRef.current !== item.item_id;
    if (switchedItem) {
      previousItemIdRef.current = item.item_id;
      skipNextManualNoteSyncRef.current = false;
      setManualReviewError("");
      setManualReviewNotice("");
      setManualReviewTab("edit");
      setHistoryPage(1);
      setHistoryTotal(0);
      setHistoryEntries([]);
      setHistoryError("");
      setHistoryEditTarget(null);
      setSavingHistoryEdit(false);
      setDeletingHistoryId("");
      setRemarkPopoverOpen(false);
      setRemarkPopoverPinned(false);
    }

    setManualVerdict(item.manual_verdict ?? "");
    setManualCategory(item.manual_verdict_category ?? "");
    if (skipNextManualNoteSyncRef.current) {
      skipNextManualNoteSyncRef.current = false;
    } else {
      setManualNote(item.manual_verdict_note ?? "");
    }
  }, [item.item_id, item.manual_verdict, item.manual_verdict_category, item.manual_verdict_note]);

  useEffect(() => {
    if (!manualReviewNotice) {
      return;
    }

    const timer = setTimeout(() => {
      setManualReviewNotice("");
    }, MANUAL_REVIEW_NOTICE_AUTO_HIDE_MS);

    return () => clearTimeout(timer);
  }, [manualReviewNotice]);

  useEffect(() => {
    if (!manualReviewError) {
      return;
    }

    const timer = setTimeout(() => {
      setManualReviewError("");
    }, MANUAL_REVIEW_ERROR_AUTO_HIDE_MS);

    return () => clearTimeout(timer);
  }, [manualReviewError]);

  useEffect(() => {
    if (!remarkPopoverPinned) {
      return;
    }

    function closeRemarkPopover(): void {
      setRemarkPopoverPinned(false);
      setRemarkPopoverOpen(false);
    }

    function handlePointerDown(event: MouseEvent): void {
      if (!remarkPopoverRef.current) {
        return;
      }
      if (remarkPopoverRef.current.contains(event.target as Node)) {
        return;
      }
      closeRemarkPopover();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        closeRemarkPopover();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [remarkPopoverPinned]);

  function toNullableText(value: string): string | null {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  const loadManualReviewHistory = useCallback(
    async (page: number): Promise<void> => {
      if (!reportId) {
        setHistoryEntries([]);
        setHistoryTotal(0);
        setHistoryError("Report is not ready yet.");
        return;
      }

      setHistoryLoading(true);
      setHistoryError("");

      try {
        const result = await fetchManualReviewHistory(reportId, item.item_id, page, MANUAL_HISTORY_PAGE_SIZE);
        setHistoryPage(result.page);
        setHistoryTotal(result.total);
        setHistoryEntries(result.entries);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load manual review history.";
        setHistoryError(message);
      } finally {
        setHistoryLoading(false);
      }
    },
    [item.item_id, reportId],
  );

  const historyViewOpen = manualReviewExpanded && manualReviewTab === "history";
  const shouldLoadHistory = historyViewOpen || remarkPopoverOpen;

  useEffect(() => {
    if (!shouldLoadHistory) {
      return;
    }

    void loadManualReviewHistory(historyPage);
  }, [historyPage, loadManualReviewHistory, shouldLoadHistory]);

  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / MANUAL_HISTORY_PAGE_SIZE));
  const normalizedManualNote = toNullableText(manualNote);
  const isManualNoteEmpty = !normalizedManualNote;
  const remarkCount = historyTotal > 0 ? historyTotal : item.manual_verdict_note?.trim() ? 1 : 0;
  const isEditingHistory = Boolean(historyEditTarget);
  const editingHistoryTimeLabel = historyEditTarget ? formatManualReviewTime(historyEditTarget.edited_at) : "";
  const isSavingAnyReview = savingManualReview || savingHistoryEdit;

  function toggleRemarkPopoverPin(): void {
    setRemarkPopoverPinned((previous) => {
      const nextPinned = !previous;
      setRemarkPopoverOpen(nextPinned);
      return nextPinned;
    });
  }

  function handleRemarkPopoverMouseEnter(): void {
    setRemarkPopoverOpen(true);
  }

  function handleRemarkPopoverMouseLeave(): void {
    if (remarkPopoverPinned) {
      return;
    }
    setRemarkPopoverOpen(false);
  }

  function beginHistoryEdit(entry: ManualReviewHistoryEntry): void {
    setManualReviewError("");
    setManualReviewNotice("");
    setHistoryEditTarget({
      history_id: entry.history_id,
      edited_at: entry.edited_at,
      manual_verdict: entry.manual_verdict,
      manual_verdict_category: entry.manual_verdict_category,
      manual_verdict_note: entry.manual_verdict_note,
    });
    setManualVerdict(entry.manual_verdict ?? "");
    setManualCategory(entry.manual_verdict_category ?? "");
    setManualNote(entry.manual_verdict_note ?? "");
    setManualReviewExpanded(true);
    setManualReviewTab("edit");
    setRemarkPopoverPinned(false);
    setRemarkPopoverOpen(false);
  }

  function cancelHistoryEdit(): void {
    setHistoryEditTarget(null);
    setManualVerdict(item.manual_verdict ?? "");
    setManualCategory(item.manual_verdict_category ?? "");
    setManualNote(item.manual_verdict_note ?? "");
    setManualReviewTab("history");
    setHistoryPage(1);
  }

  async function saveHistoryEdit(): Promise<void> {
    if (!historyEditTarget) {
      return;
    }

    const normalized = toNullableText(manualNote);
    if (!normalized) {
      setManualReviewNotice("");
      setManualReviewError("Remark cannot be empty.");
      return;
    }
    if (normalized.length > MANUAL_NOTE_MAX_LENGTH) {
      setManualReviewNotice("");
      setManualReviewError(`Manual note must be ${MANUAL_NOTE_MAX_LENGTH} characters or fewer.`);
      return;
    }

    setManualReviewError("");
    setManualReviewNotice("");
    setSavingHistoryEdit(true);
    try {
      const nextVerdict = toNullableText(manualVerdict) as ManualVerdict | null;
      const nextCategory = toNullableText(manualCategory) as ManualVerdictCategory | null;
      const payload: ManualReviewUpdatePayload = {};

      if (nextVerdict !== historyEditTarget.manual_verdict) {
        payload.manual_verdict = nextVerdict;
      }
      if (nextCategory !== historyEditTarget.manual_verdict_category) {
        payload.manual_verdict_category = nextCategory;
      }
      if (normalized !== historyEditTarget.manual_verdict_note) {
        payload.manual_verdict_note = normalized;
      }

      if (Object.keys(payload).length === 0) {
        setManualReviewNotice("");
        setManualReviewError("");
        return;
      }

      await onUpdateManualReviewHistory(item, historyEditTarget.history_id, payload);
      setManualReviewNotice("Remark updated.");
      setHistoryEditTarget(null);
      setManualReviewTab("history");
      setHistoryPage(1);
      if (shouldLoadHistory || manualReviewExpanded) {
        void loadManualReviewHistory(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update remark.";
      setManualReviewNotice("");
      setManualReviewError(message);
    } finally {
      setSavingHistoryEdit(false);
    }
  }

  async function deleteHistoryEntry(entry: ManualReviewHistoryEntry): Promise<void> {
    const confirmed = window.confirm("Delete this remark?");
    if (!confirmed) {
      return;
    }

    setManualReviewError("");
    setManualReviewNotice("");
    setDeletingHistoryId(entry.history_id);
    try {
      await onDeleteManualReviewHistory(item, entry.history_id);
      if (historyEditTarget?.history_id === entry.history_id) {
        setHistoryEditTarget(null);
        setManualReviewTab("history");
      }
      setManualReviewNotice("Remark deleted.");
      setHistoryPage(1);
      if (shouldLoadHistory) {
        void loadManualReviewHistory(1);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete remark.";
      setManualReviewNotice("");
      setManualReviewError(message);
    } finally {
      setDeletingHistoryId("");
    }
  }

  function renderManualReviewHistory(extraClassName?: string) {
    const className = extraClassName ? `c-review-history ${extraClassName}` : "c-review-history";

    return (
      <div className={className}>
        {historyLoading ? <p className="c-empty">Loading manual review history...</p> : null}
        {historyError ? <p className="c-alert">{historyError}</p> : null}
        {!historyLoading && !historyError && historyEntries.length === 0 ? (
          <p className="c-empty">No manual review history yet.</p>
        ) : null}
        {!historyLoading && !historyError && historyEntries.length > 0 ? (
          <>
            <ul className="c-review-history-list">
              {historyEntries.map((entry) => {
                const verdictLabel = toManualOptionLabel(entry.manual_verdict ?? "", MANUAL_VERDICT_OPTIONS, "Not set");
                const categoryLabel = toManualOptionLabel(entry.manual_verdict_category ?? "", MANUAL_CATEGORY_OPTIONS, "Not set");
                const isDeleting = deletingHistoryId === entry.history_id;
                return (
                  <li key={entry.history_id} className="c-review-history-item">
                    <div className="c-review-history-item-head">
                      <span className="c-review-history-item-time">{formatManualReviewTime(entry.edited_at)}</span>
                      <div className="c-card-meta">
                        <span className="c-chip">Verdict: {verdictLabel}</span>
                        <span className="c-chip">Category: {categoryLabel}</span>
                      </div>
                    </div>
                    <p className="c-review-history-item-note">{entry.manual_verdict_note ?? "No remark note."}</p>
                    <div className="c-review-history-item-actions">
                      <button
                        className="c-link-btn"
                        type="button"
                        onClick={() => beginHistoryEdit(entry)}
                        disabled={isSavingAnyReview || !!deletingHistoryId}
                      >
                        Edit
                      </button>
                      <button
                        className="c-link-btn c-link-btn-danger"
                        type="button"
                        onClick={() => void deleteHistoryEntry(entry)}
                        disabled={isSavingAnyReview || isDeleting || !!deletingHistoryId}
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {historyTotal > MANUAL_HISTORY_PAGE_SIZE ? (
              <div className="c-review-history-pagination">
                <button
                  className="c-btn c-btn-secondary"
                  type="button"
                  disabled={historyPage <= 1 || historyLoading}
                  onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <span className="c-review-history-page">Page {historyPage} / {historyTotalPages}</span>
                <button
                  className="c-btn c-btn-secondary"
                  type="button"
                  disabled={historyPage >= historyTotalPages || historyLoading}
                  onClick={() => setHistoryPage((page) => Math.min(historyTotalPages, page + 1))}
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    );
  }

  async function saveManualReview(): Promise<void> {
    if (isEditingHistory) {
      await saveHistoryEdit();
      return;
    }

    if (!normalizedManualNote) {
      setManualReviewNotice("");
      setManualReviewError("Remark cannot be empty.");
      return;
    }

    if (normalizedManualNote && normalizedManualNote.length > MANUAL_NOTE_MAX_LENGTH) {
      setManualReviewNotice("");
      setManualReviewError(`Manual note must be ${MANUAL_NOTE_MAX_LENGTH} characters or fewer.`);
      return;
    }

    const nextVerdict = toNullableText(manualVerdict) as ManualVerdict | null;
    const nextCategory = toNullableText(manualCategory) as ManualVerdictCategory | null;
    const currentVerdict = item.manual_verdict ?? null;
    const currentCategory = item.manual_verdict_category ?? null;
    const currentNote = item.manual_verdict_note ?? null;

    const payload: ManualReviewUpdatePayload = {};
    if (nextVerdict !== currentVerdict) {
      payload.manual_verdict = nextVerdict;
    }
    if (nextCategory !== currentCategory) {
      payload.manual_verdict_category = nextCategory;
    }
    if (normalizedManualNote !== currentNote) {
      payload.manual_verdict_note = normalizedManualNote;
    }

    if (Object.keys(payload).length === 0) {
      setManualReviewNotice("");
      setManualReviewError("");
      setManualNote("");
      return;
    }

    setManualReviewError("");
    setManualReviewNotice("");
    setSavingManualReview(true);

    try {
      skipNextManualNoteSyncRef.current = true;
      await onSaveManualReview(item, payload);
      setManualNote("");
      setManualReviewNotice("Save remark successful.");
      if (historyViewOpen || remarkPopoverOpen) {
        setHistoryPage(1);
        void loadManualReviewHistory(1);
      }
    } catch (error) {
      skipNextManualNoteSyncRef.current = false;
      const message = error instanceof Error ? error.message : "Failed to save remark.";
      setManualReviewNotice("");
      setManualReviewError(message);
    } finally {
      setSavingManualReview(false);
    }
  }

  function clearManualReview(): void {
    setManualReviewError("");
    setManualReviewNotice("");
    setManualVerdict("");
    setManualCategory("");
    setManualNote("");
  }

  return (
    <article className={`c-card is-${item.consistency_status}${isActive ? " is-active" : ""}`}>
      <div className="c-card-top">
        <div className="c-card-heading">
          <div className="c-card-title-row">
            <h3 className="c-card-title">{reviewTitle}</h3>
          </div>
          <div className="c-card-tags">
            <span className={`c-chip is-status is-${item.consistency_status}`}>Status: {consistencyLabel}</span>
            <span className="c-chip is-category">Category: {checkTypeLabel}</span>
            <span className={`c-chip is-severity is-${item.severity}`}>Severity: {severityLabel}</span>
            <span className="c-chip is-confidence">Confidence: {confidenceLabel}</span>
          </div>
        </div>
        <div
          ref={remarkPopoverRef}
          className="c-card-top-actions"
          onMouseEnter={handleRemarkPopoverMouseEnter}
          onMouseLeave={handleRemarkPopoverMouseLeave}
          onBlur={(event) => {
            if (remarkPopoverPinned) {
              return;
            }
            const relatedTarget = event.relatedTarget;
            if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
              return;
            }
            setRemarkPopoverOpen(false);
          }}
        >
          <button
            type="button"
            className={`c-remark-trigger${remarkPopoverOpen ? " is-open" : ""}`}
            onClick={toggleRemarkPopoverPin}
            aria-label="Open remark history"
            aria-expanded={remarkPopoverOpen}
            aria-controls={`remark-popover-${item.item_id}`}
          >
            <span>Remark</span>
            {remarkCount > 0 ? <span className="c-remark-trigger-count">{remarkCount}</span> : null}
          </button>
          {remarkPopoverOpen ? (
            <section
              id={`remark-popover-${item.item_id}`}
              className="c-remark-popover"
              aria-label="Remark history"
            >
              <div className="c-remark-popover-head">
                <p className="c-card-section-label">Remark History</p>
                {remarkPopoverPinned ? (
                  <button
                    type="button"
                    className="c-link-btn"
                    onClick={() => {
                      setRemarkPopoverPinned(false);
                      setRemarkPopoverOpen(false);
                    }}
                  >
                    Close
                  </button>
                ) : null}
              </div>
              {renderManualReviewHistory("is-popover")}
            </section>
          ) : null}
        </div>
      </div>

      <section className="c-card-section" aria-label="Description">
        <p className="c-card-section-label">Description</p>
        <p className="c-card-section-content">{item.description}</p>
      </section>
      <section className="c-card-section" aria-label="Reasoning">
        <p className="c-card-section-label">Reasoning</p>
        <p className="c-card-section-content">{item.reasoning}</p>
      </section>
      <EvidenceReferenceList
        items={referenceItems}
        evidenceText={normalizedEvidence}
        onSelect={(entry) =>
          onEvidenceClick(item, {
            forcedDocumentId: entry.documentId,
            evidenceTextOverride: entry.evidenceText,
            referenceId: entry.id,
          })
        }
      />

      <div className="c-card-meta">
        <span className="c-card-meta-label">Keywords</span>
        {item.keywords.map((keyword, index) => (
          <span key={`${keyword}-${index}`} className="c-chip">
            {keyword}
          </span>
        ))}
      </div>

      <section className="c-card-section c-review-section" aria-label="Manual review">
        <div className="c-review-header">
          <p className="c-card-section-label">Manual Review</p>
          <button
            className="c-link-btn c-review-toggle"
            type="button"
            onClick={() => setManualReviewExpanded((value) => !value)}
            aria-expanded={manualReviewExpanded}
            aria-controls={`manual-review-panel-${item.item_id}`}
          >
            {manualReviewExpanded ? "Collapse" : "Edit"}
            <span className={`c-review-toggle-chevron${manualReviewExpanded ? " is-open" : ""}`} aria-hidden="true">
              ▾
            </span>
          </button>
        </div>

        {manualReviewExpanded ? (
          <div id={`manual-review-panel-${item.item_id}`} className="c-review-panel">
            <div className="c-review-tabs" role="tablist" aria-label="Manual review tabs">
              <button
                className={`c-review-tab${manualReviewTab === "edit" ? " is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={manualReviewTab === "edit"}
                onClick={() => setManualReviewTab("edit")}
              >
                Edit
              </button>
              <button
                className={`c-review-tab${manualReviewTab === "history" ? " is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={manualReviewTab === "history"}
                onClick={() => {
                  setManualReviewTab("history");
                  setHistoryPage(1);
                }}
              >
                History
              </button>
            </div>

            {manualReviewTab === "edit" ? (
              <>
                {isEditingHistory ? (
                  <div className="c-review-edit-state">
                    <p className="c-notice c-review-feedback">Editing history from {editingHistoryTimeLabel}</p>
                    <button className="c-link-btn" type="button" onClick={cancelHistoryEdit} disabled={isSavingAnyReview}>
                      Cancel History Edit
                    </button>
                  </div>
                ) : null}

                <div className="c-review-grid">
                  <label className="c-review-field" htmlFor={`manual-verdict-${item.item_id}`}>
                    <span className="c-review-field-label">Verdict</span>
                    <select
                      id={`manual-verdict-${item.item_id}`}
                      className="c-select-input"
                      value={manualVerdict}
                      onChange={(event) => {
                        setManualVerdict(event.target.value);
                        setManualReviewError("");
                        setManualReviewNotice("");
                      }}
                      disabled={isSavingAnyReview}
                    >
                      <option value="">Not set</option>
                      {MANUAL_VERDICT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="c-review-field" htmlFor={`manual-category-${item.item_id}`}>
                    <span className="c-review-field-label">Category</span>
                    <select
                      id={`manual-category-${item.item_id}`}
                      className="c-select-input"
                      value={manualCategory}
                      onChange={(event) => {
                        setManualCategory(event.target.value);
                        setManualReviewError("");
                        setManualReviewNotice("");
                      }}
                      disabled={isSavingAnyReview}
                    >
                      <option value="">Not set</option>
                      {MANUAL_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="c-review-field c-review-note" htmlFor={`manual-note-${item.item_id}`}>
                  <span className="c-review-field-label">Remark</span>
                  <textarea
                    id={`manual-note-${item.item_id}`}
                    className="c-textarea"
                    value={manualNote}
                    maxLength={MANUAL_NOTE_MAX_LENGTH}
                    onChange={(event) => {
                      setManualNote(event.target.value);
                      setManualReviewError("");
                      setManualReviewNotice("");
                    }}
                    disabled={isSavingAnyReview}
                    placeholder="Add manual review notes..."
                  />
                  <span className="c-review-counter">
                    {manualNote.length}/{MANUAL_NOTE_MAX_LENGTH}
                  </span>
                </label>

                <div className="c-card-footer c-review-actions">
                  <button className="c-btn c-btn-secondary" type="button" onClick={() => void clearManualReview()} disabled={isSavingAnyReview}>
                    Clear Remark
                  </button>
                  <button className="c-btn c-btn-primary" type="button" onClick={() => void saveManualReview()} disabled={isSavingAnyReview || isManualNoteEmpty}>
                    {isSavingAnyReview ? "Saving..." : isEditingHistory ? "Save History Edit" : "Save Remark"}
                  </button>
                </div>

                {manualReviewError ? <p className="c-alert c-review-feedback">{manualReviewError}</p> : null}
                {manualReviewNotice ? <p className="c-notice c-review-feedback">{manualReviewNotice}</p> : null}
              </>
            ) : null}

            {manualReviewTab === "history" ? renderManualReviewHistory() : null}
          </div>
        ) : null}
      </section>
    </article>
  );
}
