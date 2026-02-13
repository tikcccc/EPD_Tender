type WorkspaceDocumentOption = {
  documentId: string;
  label: string;
};

type WorkspaceToolbarProps = {
  displayName: string;
  fileName: string;
  currentDocumentId: string;
  documentOptions: WorkspaceDocumentOption[];
  currentPage: number;
  pageCount: number;
  zoom: number;
  fitWidth: boolean;
  isDocumentSwitching?: boolean;
  onDocumentChange: (documentId: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
  onFitWidth: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onOpenDocument: () => void;
};

export function WorkspaceToolbar({
  displayName,
  fileName,
  currentDocumentId,
  documentOptions,
  currentPage,
  pageCount,
  zoom,
  fitWidth,
  isDocumentSwitching,
  onDocumentChange,
  onPrevPage,
  onNextPage,
  onPageChange,
  onFitWidth,
  onZoomIn,
  onZoomOut,
  onOpenDocument,
}: WorkspaceToolbarProps) {
  const safeCurrentPage = Math.max(1, Math.floor(currentPage || 1));
  const pageTotalText = pageCount > 0 ? ` / ${pageCount}` : "";

  return (
    <div className="c-toolbar">
      <div className="c-toolbar-doc">
        <p className="c-toolbar-title">{displayName}</p>
        <p className="c-toolbar-subtitle">
          {fileName} · Page {safeCurrentPage}
          {pageTotalText}
        </p>
      </div>
      <div className="c-toolbar-actions">
        <select
          className="c-select-input c-toolbar-doc-select"
          value={currentDocumentId}
          onChange={(event) => onDocumentChange(event.target.value)}
          disabled={documentOptions.length <= 1 || isDocumentSwitching}
          aria-label="Switch document"
        >
          {documentOptions.map((option) => (
            <option key={option.documentId} value={option.documentId}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="c-toolbar-btn" type="button" onClick={onPrevPage} disabled={safeCurrentPage <= 1}>
          Prev
        </button>
        <label className="c-page-input-wrap">
          <span className="u-muted">Page</span>
          <input
            className="c-page-input"
            type="number"
            min={1}
            max={pageCount > 0 ? pageCount : undefined}
            value={safeCurrentPage}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              if (!Number.isNaN(next)) {
                onPageChange(next);
              }
            }}
          />
          <span className="u-muted">{pageCount > 0 ? `/ ${pageCount}` : ""}</span>
        </label>
        <button
          className="c-toolbar-btn"
          type="button"
          onClick={onNextPage}
          disabled={pageCount > 0 ? safeCurrentPage >= pageCount : false}
        >
          Next
        </button>
        <button className="c-toolbar-btn" type="button" onClick={onZoomOut}>
          Zoom-
        </button>
        <span className="c-zoom-value">{fitWidth ? "Fit" : `${zoom}%`}</span>
        <button className="c-toolbar-btn" type="button" onClick={onZoomIn}>
          Zoom+
        </button>
        <button className="c-toolbar-btn" type="button" onClick={onFitWidth}>
          Fit Width
        </button>
        <button className="c-btn c-btn-secondary" type="button" onClick={onOpenDocument}>
          Open PDF
        </button>
      </div>
    </div>
  );
}
