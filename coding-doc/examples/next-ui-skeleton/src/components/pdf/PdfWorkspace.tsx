type PdfWorkspaceProps = {
  fileName: string;
  currentPage: number;
};

export function PdfWorkspace({ fileName, currentPage }: PdfWorkspaceProps) {
  return (
    <div>
      <div className="c-doc-header">
        <strong>{fileName}</strong>
        <span className="u-muted">Page {currentPage}</span>
      </div>
      <div className="c-pdf-canvas">
        <p className="u-muted">PDF viewer integration point (pdf.js / react-pdf).</p>
      </div>
    </div>
  );
}
