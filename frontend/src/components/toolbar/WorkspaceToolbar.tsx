import { useMemo, useState } from "react";

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
  const [documentSearch, setDocumentSearch] = useState("");
  const safeCurrentPage = Math.max(1, Math.floor(currentPage || 1));
  const pageTotalText = pageCount > 0 ? ` / ${pageCount}` : "";
  const normalizedSearch = documentSearch.trim().toLowerCase();
  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) {
      return documentOptions;
    }

    const matched = documentOptions.filter((option) => option.label.toLowerCase().includes(normalizedSearch));
    if (matched.some((option) => option.documentId === currentDocumentId)) {
      return matched;
    }

    const current = documentOptions.find((option) => option.documentId === currentDocumentId);
    return current ? [current, ...matched] : matched;
  }, [currentDocumentId, documentOptions, normalizedSearch]);
  const showSearch = documentOptions.length > 12;

  return (
    <div className="c-toolbar">
      <div className="c-toolbar-doc">
        <p className="c-toolbar-title">{fileName}</p>
        <p className="c-toolbar-subtitle">Page {safeCurrentPage}{pageTotalText}</p>
      </div>
      <div className="c-toolbar-top-actions">
        {showSearch ? (
          <input
            className="c-search-input c-toolbar-doc-search"
            type="search"
            value={documentSearch}
            placeholder="Find document..."
            onChange={(event) => setDocumentSearch(event.target.value)}
            aria-label="Search documents"
          />
        ) : null}
        <select
          className="c-select-input c-toolbar-doc-select"
          value={currentDocumentId}
          onChange={(event) => onDocumentChange(event.target.value)}
          disabled={Boolean(isDocumentSwitching)}
          aria-label="Switch document"
        >
          {filteredOptions.map((option) => (
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
