import { useMemo } from "react";
import { TruncatedTooltip } from "@/components/common/TruncatedTooltip";
import { EvidenceReferenceList } from "@/components/report/EvidenceReferenceList";
import type { ReportItem } from "@/features/tender-ui/types";

type ComplianceCardProps = {
  item: ReportItem;
  isActive: boolean;
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
};

const REFERENCE_PREVIEW_LIMIT = 120;
const REFERENCE_MARKER_RE = /from\s+(?:document\s+)?([a-z0-9._-]+)(?:\s*,[^:\n]+)?\s*:/gi;
const QUOTED_SEGMENT_PATTERNS = [/"([^"]+)"/g, /“([^”]+)”/g];

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
  activeDocumentId,
  activeReferenceId,
  documentLabels,
  documentFileNames,
  onEvidenceClick,
}: ComplianceCardProps) {
  const normalizedEvidence = item.evidence.replace(/\s+/g, " ").trim();
  const severityLabel = `${item.severity.charAt(0).toUpperCase()}${item.severity.slice(1)}`;
  const confidenceLabel = item.confidence_score.toFixed(2);
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

  return (
    <article className={`c-card is-${item.consistency_status}${isActive ? " is-active" : ""}`}>
      <div className="c-card-top">
        <div className="c-card-heading">
          <h3 className="c-card-title">Compliance Review</h3>
          <div className="c-card-tags">
            <span className="c-chip is-category">Category: {checkTypeLabel}</span>
            <span className={`c-chip is-severity is-${item.severity}`}>Severity: {severityLabel}</span>
            <span className="c-chip is-confidence">Confidence: {confidenceLabel}</span>
          </div>
        </div>
      </div>

      <section className="c-card-section" aria-label="Description">
        <p className="c-card-section-label">Description</p>
        <TruncatedTooltip
          text={item.description}
          wrapperClassName="c-card-section-content-wrap"
          triggerClassName="c-card-section-content c-card-section-content-truncate"
          tooltipClassName="c-card-section-tooltip"
          focusable
        />
      </section>
      <section className="c-card-section" aria-label="Reasoning">
        <p className="c-card-section-label">Reasoning</p>
        <TruncatedTooltip
          text={item.reasoning}
          wrapperClassName="c-card-section-content-wrap"
          triggerClassName="c-card-section-content c-card-section-content-truncate"
          tooltipClassName="c-card-section-tooltip"
          focusable
        />
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
    </article>
  );
}
