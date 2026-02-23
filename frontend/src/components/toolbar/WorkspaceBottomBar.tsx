type WorkspaceBottomBarProps = {
  currentPage: number;
  pageCount: number;
  zoom: number;
  fitWidth: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  onPageChange: (page: number) => void;
  onFitWidth: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function WorkspaceBottomBar({
  currentPage,
  pageCount,
  zoom,
  fitWidth,
  onPrevPage,
  onNextPage,
  onPageChange,
  onFitWidth,
  onZoomIn,
  onZoomOut,
}: WorkspaceBottomBarProps) {
  const safeCurrentPage = Math.max(1, Math.floor(currentPage || 1));
  const disableNext = pageCount > 0 ? safeCurrentPage >= pageCount : false;

  return (
    <div className="c-workspace-bottombar" role="toolbar" aria-label="Document navigation and zoom controls">
      <div className="c-workspace-bottombar-group">
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
        <button className="c-toolbar-btn" type="button" onClick={onNextPage} disabled={disableNext}>
          Next
        </button>
      </div>

      <div className="c-workspace-bottombar-divider" aria-hidden="true" />

      <div className="c-workspace-bottombar-group">
        <button className="c-toolbar-btn is-compact" type="button" onClick={onZoomOut} aria-label="Zoom out">
          -
        </button>
        <span className="c-zoom-value">{fitWidth ? "Fit" : `${zoom}%`}</span>
        <button className="c-toolbar-btn is-compact" type="button" onClick={onZoomIn} aria-label="Zoom in">
          +
        </button>
        <button className="c-toolbar-btn" type="button" onClick={onFitWidth}>
          Fit Width
        </button>
      </div>
    </div>
  );
}
