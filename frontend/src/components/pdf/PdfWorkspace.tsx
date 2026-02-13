import { useEffect, useMemo, useRef, useState } from "react";
import { getApiBaseUrl } from "@/features/tender-ui/api-client";
import type { BBox } from "@/features/tender-ui/types";

type PdfWorkspaceProps = {
  documentId: string;
  currentPage: number;
  highlightPage?: number | null;
  bbox: BBox | null;
  bboxes: BBox[] | null;
  zoom: number;
  fitWidth: boolean;
  isApproximate: boolean;
  isLoading: boolean;
  errorMessage?: string;
  onPageCountChange?: (pageCount: number) => void;
};

type PdfjsModule = {
  version: string;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (input: string | { url: string; withCredentials?: boolean }) => {
    promise: Promise<PdfDocumentProxy>;
    destroy: () => void;
  };
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};

type PdfPageProxy = {
  getViewport: (params: { scale: number }) => {
    width: number;
    height: number;
  };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: {
      width: number;
      height: number;
    };
  }) => {
    promise: Promise<void>;
    cancel?: () => void;
  };
};

function getRenderScale(zoom: number): number {
  return Math.max(0.6, Math.min(2.2, zoom / 100));
}

export function PdfWorkspace({
  documentId,
  currentPage,
  highlightPage = null,
  bbox,
  bboxes,
  zoom,
  fitWidth,
  isApproximate,
  isLoading,
  errorMessage,
  onPageCountChange,
}: PdfWorkspaceProps) {
  const [pdfjsModule, setPdfjsModule] = useState<PdfjsModule | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [renderScale, setRenderScale] = useState(1);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [renderError, setRenderError] = useState("");
  const viewerShellRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadRequestIdRef = useRef(0);

  const manualScale = useMemo(() => getRenderScale(zoom), [zoom]);

  const pdfUrl = useMemo(() => {
    if (!documentId || documentId === "unknown") {
      return "";
    }

    return `${getApiBaseUrl()}/api/v1/documents/${encodeURIComponent(documentId)}/file`;
  }, [documentId]);

  useEffect(() => {
    let disposed = false;

    async function loadPdfjs(): Promise<void> {
      try {
        const pdfjs = (await import("pdfjs-dist")) as unknown as PdfjsModule;
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        if (!disposed) {
          setPdfjsModule(pdfjs);
        }
      } catch {
        if (!disposed) {
          setRenderError("Failed to load pdfjs runtime.");
        }
      }
    }

    void loadPdfjs();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let currentDocument: PdfDocumentProxy | null = null;
    let loadingTask: ReturnType<PdfjsModule["getDocument"]> | null = null;

    async function loadDocument(): Promise<void> {
      if (!pdfjsModule || !pdfUrl) {
        setPdfDocument(null);
        setPageCount(0);
        setCanvasSize({ width: 0, height: 0 });
        setLoadingPdf(false);
        onPageCountChange?.(0);
        return;
      }

      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;

      setLoadingPdf(true);
      setRenderError("");
      setPdfDocument(null);
      setPageCount(0);
      setCanvasSize({ width: 0, height: 0 });
      onPageCountChange?.(0);

      try {
        loadingTask = pdfjsModule.getDocument({ url: pdfUrl, withCredentials: false });
        currentDocument = await loadingTask.promise;

        if (!disposed && loadRequestIdRef.current === requestId) {
          setPdfDocument(currentDocument);
          setPageCount(currentDocument.numPages);
          onPageCountChange?.(currentDocument.numPages);
        } else {
          await currentDocument.destroy();
        }
      } catch {
        if (!disposed && loadRequestIdRef.current === requestId) {
          setRenderError("Unable to load PDF document.");
          setPdfDocument(null);
          setPageCount(0);
          setCanvasSize({ width: 0, height: 0 });
          onPageCountChange?.(0);
        }
      } finally {
        if (!disposed && loadRequestIdRef.current === requestId) {
          setLoadingPdf(false);
        }
      }
    }

    void loadDocument();

    return () => {
      disposed = true;
      if (loadingTask) {
        loadingTask.destroy();
      }
      if (currentDocument) {
        void currentDocument.destroy();
      }
    };
  }, [onPageCountChange, pdfjsModule, pdfUrl]);

  useEffect(() => {
    if (pdfDocument || !canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (context && canvas.width > 0 && canvas.height > 0) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
    canvas.style.width = "0px";
    canvas.style.height = "0px";
  }, [pdfDocument]);

  const safePage = useMemo(() => {
    if (pageCount <= 0) {
      return Math.max(1, currentPage);
    }
    return Math.min(pageCount, Math.max(1, currentPage));
  }, [currentPage, pageCount]);

  useEffect(() => {
    const viewerElement = viewerShellRef.current;
    if (!viewerElement) {
      return;
    }

    const updateWidth = (): void => {
      setViewerWidth(viewerElement.clientWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(viewerElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let renderTask: { promise: Promise<void>; cancel?: () => void } | null = null;

    async function renderPage(): Promise<void> {
      if (!pdfDocument || !canvasRef.current) {
        return;
      }

      try {
        const page = await pdfDocument.getPage(safePage);
        const unscaledViewport = page.getViewport({ scale: 1 });
        let effectiveScale = manualScale;

        if (fitWidth && viewerWidth > 0) {
          const horizontalGutter = 20;
          const targetWidth = Math.max(240, viewerWidth - horizontalGutter);
          effectiveScale = Math.max(0.6, Math.min(2.2, targetWidth / unscaledViewport.width));
        }

        const viewport = page.getViewport({ scale: effectiveScale });
        const canvas = canvasRef.current;

        if (!canvas) {
          return;
        }

        const context = canvas.getContext("2d");
        if (!context) {
          setRenderError("Cannot render PDF canvas.");
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        renderTask = page.render({
          canvasContext: context,
          viewport,
        });

        await renderTask.promise;

        if (!disposed) {
          setCanvasSize({ width: viewport.width, height: viewport.height });
          setRenderScale(effectiveScale);
          setRenderError("");
        }
      } catch {
        if (!disposed) {
          setRenderError("Failed to render current PDF page.");
        }
      }
    }

    void renderPage();

    return () => {
      disposed = true;
      if (renderTask?.cancel) {
        renderTask.cancel();
      }
    };
  }, [fitWidth, manualScale, pdfDocument, safePage, viewerWidth]);

  const highlightStyles = useMemo(() => {
    if (canvasSize.width <= 0 || canvasSize.height <= 0) {
      return [];
    }
    if (!highlightPage || safePage !== highlightPage) {
      return [];
    }

    const effectiveBboxes = bboxes && bboxes.length > 0 ? bboxes : bbox ? [bbox] : [];
    return effectiveBboxes.map((rect) => {
      const left = rect.x0 * renderScale;
      const top = rect.y0 * renderScale;
      const width = (rect.x1 - rect.x0) * renderScale;
      const height = (rect.y1 - rect.y0) * renderScale;

      return {
        left: `${Math.max(0, left)}px`,
        top: `${Math.max(0, top)}px`,
        width: `${Math.max(2, width)}px`,
        height: `${Math.max(2, height)}px`,
      };
    });
  }, [bbox, bboxes, canvasSize.height, canvasSize.width, highlightPage, renderScale, safePage]);

  return (
    <div className="c-pdf-stage">
      {isApproximate ? <p className="c-notice">Approximate anchor match for this evidence card.</p> : null}
      {errorMessage ? <p className="c-alert">{errorMessage}</p> : null}
      {renderError ? <p className="c-alert">{renderError}</p> : null}
      {isLoading || loadingPdf ? <p className="c-empty">Resolving evidence and rendering PDF...</p> : null}

      <section className="c-pdf-viewer-shell c-pdf-viewer-shell-full" aria-live="polite" ref={viewerShellRef}>
        {pdfUrl ? (
          <div
            className="c-pdf-page-wrap"
            style={{
              width: canvasSize.width > 0 ? `${canvasSize.width}px` : undefined,
              minHeight: canvasSize.height > 0 ? `${canvasSize.height}px` : "540px",
            }}
          >
            <canvas className="c-pdf-page-canvas" ref={canvasRef} />
            {highlightStyles.map((style, index) => (
              <div
                key={`${index}-${style.left}-${style.top}-${style.width}-${style.height}`}
                className="c-pdf-highlight-box"
                style={style}
              />
            ))}
          </div>
        ) : (
          <p className="c-empty">Document not resolved yet.</p>
        )}
      </section>
    </div>
  );
}
