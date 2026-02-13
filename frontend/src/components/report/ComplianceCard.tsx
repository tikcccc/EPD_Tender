import { useMemo } from "react";
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

const STATUS_LABELS: Record<ReportItem["consistency_status"], string> = {
  consistent: "Consistent",
  inconsistent: "Inconsistent",
  unknown: "Unknown",
};

function normalizeEvidenceText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
        <span className={`c-chip is-${item.consistency_status}`}>{STATUS_LABELS[item.consistency_status]}</span>
        {item.keywords.slice(0, 3).map((keyword) => (
          <span key={keyword} className="c-chip">
            {keyword}
          </span>
        ))}
      </div>
    </article>
  );
}
