type WorkspaceDocumentOption = {
  documentId: string;
  label: string;
};

type WorkspaceToolbarProps = {
  fileName: string;
  currentDocumentId: string;
  documentOptions: WorkspaceDocumentOption[];
  currentPage: number;
  pageCount: number;
  isDocumentSwitching?: boolean;
  onDocumentChange: (documentId: string) => void;
  onOpenDocument: () => void;
};

export function WorkspaceToolbar({
  fileName,
  currentDocumentId,
  documentOptions,
  currentPage,
  pageCount,
  isDocumentSwitching,
  onDocumentChange,
  onOpenDocument,
}: WorkspaceToolbarProps) {
  const safeCurrentPage = Math.max(1, Math.floor(currentPage || 1));
  const pageTotalText = pageCount > 0 ? ` / ${pageCount}` : "";

  return (
    <div className="c-toolbar">
      <div className="c-toolbar-doc">
        <p className="c-toolbar-title">{fileName}</p>
        <p className="c-toolbar-subtitle">Page {safeCurrentPage}{pageTotalText}</p>
      </div>
      <div className="c-toolbar-top-actions">
        <select
          className="c-select-input c-toolbar-doc-select"
          value={currentDocumentId}
          onChange={(event) => onDocumentChange(event.target.value)}
          disabled={Boolean(isDocumentSwitching)}
          aria-label="Switch document"
        >
          {documentOptions.map((option) => (
            <option key={option.documentId} value={option.documentId}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="c-btn c-btn-secondary" type="button" onClick={onOpenDocument}>
          Open PDF
        </button>
      </div>
    </div>
  );
}
