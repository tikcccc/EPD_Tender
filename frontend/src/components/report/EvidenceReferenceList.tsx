import { TruncatedTooltip } from "@/components/common/TruncatedTooltip";

type EvidenceReferenceItem = {
  id: string;
  documentId: string;
  label: string;
  preview: string;
  evidenceText: string;
  isActive: boolean;
  isPreviewable: boolean;
};

type EvidenceReferenceListProps = {
  items: EvidenceReferenceItem[];
  evidenceText: string;
  page: number;
  pageSize: number;
  onSelect: (item: EvidenceReferenceItem) => void;
  onPageChange: (page: number) => void;
};

export function EvidenceReferenceList({
  items,
  evidenceText,
  page,
  pageSize,
  onSelect,
  onPageChange,
}: EvidenceReferenceListProps) {
  const normalizedEvidence = evidenceText.replace(/\s+/g, " ").trim();
  const evidenceTagText =
    normalizedEvidence.length > 42 ? `${normalizedEvidence.slice(0, 42).trimEnd()}...` : normalizedEvidence;
  const isEvidenceTagTruncated = evidenceTagText !== normalizedEvidence;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleItems = items.slice(pageStart, pageStart + pageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

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
        {visibleItems.map((item) => (
          <button
            key={item.id}
            className={`c-evidence-ref-item${item.isActive ? " is-active" : ""}${item.isPreviewable ? "" : " is-disabled"}`}
            type="button"
            onClick={() => onSelect(item)}
            disabled={!item.isPreviewable}
            title={item.isPreviewable ? undefined : "Preview is only available for registered project PDFs."}
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
      {totalPages > 1 ? (
        <div className="c-evidence-ref-pagination" aria-label="Referenced sources pagination">
          <span className="c-evidence-ref-pagination-meta">
            Page {currentPage} / {totalPages}
          </span>
          <div className="c-evidence-ref-pagination-actions">
            <button
              className="c-btn c-btn-secondary"
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            >
              Previous
            </button>
            <div className="c-evidence-ref-pagination-pages" aria-label="Referenced sources page numbers">
              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  className={`c-evidence-ref-page-btn${pageNumber === currentPage ? " is-active" : ""}`}
                  type="button"
                  aria-current={pageNumber === currentPage ? "page" : undefined}
                  onClick={() => onPageChange(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <button
              className="c-btn c-btn-secondary"
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
