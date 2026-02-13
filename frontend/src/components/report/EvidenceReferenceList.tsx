type EvidenceReferenceItem = {
  documentId: string;
  label: string;
  preview: string;
  evidenceText: string;
  isActive: boolean;
};

type EvidenceReferenceListProps = {
  items: EvidenceReferenceItem[];
  onSelect: (item: EvidenceReferenceItem) => void;
};

export function EvidenceReferenceList({ items, onSelect }: EvidenceReferenceListProps) {
  return (
    <section className="c-evidence-ref-section" aria-label="Evidence references">
      <p className="c-evidence-ref-title">Referenced Sources</p>
      <div className="c-evidence-ref-list">
        {items.map((item) => (
          <button
            key={item.documentId}
            className={`c-evidence-ref-item${item.isActive ? " is-active" : ""}`}
            type="button"
            onClick={() => onSelect(item)}
          >
            <span className="c-evidence-ref-label">{item.label}</span>
            <span className="c-evidence-ref-preview">{item.preview}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
