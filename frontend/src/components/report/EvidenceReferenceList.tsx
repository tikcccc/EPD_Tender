import { TruncatedTooltip } from "@/components/common/TruncatedTooltip";

type EvidenceReferenceItem = {
  id: string;
  documentId: string;
  label: string;
  preview: string;
  evidenceText: string;
  isActive: boolean;
};

type EvidenceReferenceListProps = {
  items: EvidenceReferenceItem[];
  evidenceText: string;
  onSelect: (item: EvidenceReferenceItem) => void;
};

export function EvidenceReferenceList({ items, evidenceText, onSelect }: EvidenceReferenceListProps) {
  const normalizedEvidence = evidenceText.replace(/\s+/g, " ").trim();
  const evidenceTagText =
    normalizedEvidence.length > 42 ? `${normalizedEvidence.slice(0, 42).trimEnd()}...` : normalizedEvidence;
  const isEvidenceTagTruncated = evidenceTagText !== normalizedEvidence;

  return (
    <section className="c-evidence-ref-section" aria-label="Evidence references">
      <div className="c-evidence-ref-head">
        <p className="c-evidence-ref-title">Referenced Sources</p>
        <TruncatedTooltip
          text={normalizedEvidence}
          visibleText={evidenceTagText || "..."}
          wrapperClassName="c-evidence-ref-evidence-wrap"
          triggerClassName="c-evidence-ref-evidence-tag"
          forceTooltip={isEvidenceTagTruncated}
          focusable
        />
      </div>
      <div className="c-evidence-ref-list">
        {items.map((item) => (
          <button
            key={item.id}
            className={`c-evidence-ref-item${item.isActive ? " is-active" : ""}`}
            type="button"
            onClick={() => onSelect(item)}
          >
            <TruncatedTooltip
              text={item.label}
              wrapperClassName="c-evidence-ref-label-wrap"
              triggerClassName="c-evidence-ref-label"
            />
            <TruncatedTooltip
              text={item.evidenceText}
              visibleText={item.preview}
              wrapperClassName="c-evidence-ref-preview-wrap"
              triggerClassName="c-evidence-ref-preview"
              forceTooltip={item.preview !== item.evidenceText}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
