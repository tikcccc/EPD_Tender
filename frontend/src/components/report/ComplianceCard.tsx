import { useMemo } from "react";
import { EvidenceReferenceList } from "@/components/report/EvidenceReferenceList";
import type { ReportItem } from "@/features/tender-ui/types";

type ComplianceCardProps = {
  item: ReportItem;
  isActive: boolean;
  activeDocumentId?: string;
  documentLabels: Record<string, string>;
  onEvidenceClick: (
    item: ReportItem,
    options?: {
      forcedDocumentId?: string;
      evidenceTextOverride?: string;
    },
  ) => void;
};

const EVIDENCE_PREVIEW_LIMIT = 260;
const REFERENCE_PREVIEW_LIMIT = 120;
const REFERENCE_MARKER_RE = /from\s+(?:document\s+)?([a-z0-9._-]+)(?:\s*,[^:\n]+)?\s*:/gi;
const QUOTED_SEGMENT_RE = /"([^"]+)"/g;

const STATUS_LABELS: Record<ReportItem["consistency_status"], string> = {
  consistent: "Consistent",
  inconsistent: "Inconsistent",
  unknown: "Unknown",
};

function normalizeEvidenceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractReferenceEvidenceByDocument(item: ReportItem): Map<string, string> {
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

    const quoteRegex = new RegExp(QUOTED_SEGMENT_RE);
    const quotedPieces = Array.from(segment.matchAll(quoteRegex))
      .map((quoted) => normalizeEvidenceText(quoted[1] ?? ""))
      .filter(Boolean);
    const normalizedSegment = normalizeEvidenceText(segment.replace(quoteRegex, "$1"));
    const fragments = quotedPieces.length > 0 ? quotedPieces : normalizedSegment ? [normalizedSegment] : [];

    if (fragments.length === 0) {
      return;
    }

    const existing = extractedMap.get(documentId) ?? [];
    extractedMap.set(documentId, [...existing, ...fragments]);
  });

  const result = new Map<string, string>();
  extractedMap.forEach((segments, documentId) => {
    const joined = normalizeEvidenceText(segments.join(" "));
    if (joined) {
      result.set(documentId, joined);
    }
  });

  return result;
}

export function ComplianceCard({
  item,
  isActive,
  activeDocumentId,
  documentLabels,
  onEvidenceClick,
}: ComplianceCardProps) {
  const normalizedEvidence = item.evidence.replace(/\s+/g, " ").trim();
  const isEvidenceTruncated = normalizedEvidence.length > EVIDENCE_PREVIEW_LIMIT;
  const evidencePreview = isEvidenceTruncated
    ? `${normalizedEvidence.slice(0, EVIDENCE_PREVIEW_LIMIT).trimEnd()}...`
    : normalizedEvidence;
  const evidenceByDocument = useMemo(() => extractReferenceEvidenceByDocument(item), [item]);
  const referenceItems = useMemo(() => {
    const references = Array.from(new Set(item.document_references.map((reference) => reference.trim()).filter(Boolean)));
    return references.map((documentId) => {
      const evidenceText = evidenceByDocument.get(documentId) ?? normalizedEvidence;
      const preview =
        evidenceText.length > REFERENCE_PREVIEW_LIMIT
          ? `${evidenceText.slice(0, REFERENCE_PREVIEW_LIMIT).trimEnd()}...`
          : evidenceText;

      return {
        documentId,
        label: documentLabels[documentId] ?? documentId,
        preview,
        evidenceText,
        isActive: activeDocumentId === documentId,
      };
    });
  }, [activeDocumentId, documentLabels, evidenceByDocument, item.document_references, normalizedEvidence]);
  const hasMultipleReferences = referenceItems.length > 1;

  return (
    <article className={`c-card is-${item.consistency_status}${isActive ? " is-active" : ""}`}>
      <div className="c-card-top">
        <div>
          <p className="c-card-kicker">Check Type: {item.check_type}</p>
          <h3 className="c-card-title">{item.description}</h3>
        </div>
        <div className="c-card-score">
          <span className={`c-badge is-${item.severity}`}>{item.severity.toUpperCase()}</span>
          <span className="c-badge is-consistent">{item.confidence_score.toFixed(2)}</span>
        </div>
      </div>

      <p className="c-card-summary">{item.reasoning}</p>
      <div className="c-card-evidence-wrap" tabIndex={isEvidenceTruncated ? 0 : undefined}>
        <p className="c-card-evidence">{evidencePreview}</p>
        {isEvidenceTruncated ? <p className="c-card-evidence-tooltip">{normalizedEvidence}</p> : null}
      </div>
      {hasMultipleReferences ? (
        <EvidenceReferenceList
          items={referenceItems}
          onSelect={(entry) =>
            onEvidenceClick(item, {
              forcedDocumentId: entry.documentId,
              evidenceTextOverride: entry.evidenceText,
            })
          }
        />
      ) : null}

      <div className="c-card-meta">
        <span className={`c-chip is-${item.consistency_status}`}>{STATUS_LABELS[item.consistency_status]}</span>
        {item.keywords.slice(0, 3).map((keyword) => (
          <span key={keyword} className="c-chip">
            {keyword}
          </span>
        ))}
      </div>

      <footer className="c-card-footer">
        <button className="c-link-btn" type="button" onClick={() => onEvidenceClick(item)}>
          View evidence
        </button>
      </footer>
    </article>
  );
}
