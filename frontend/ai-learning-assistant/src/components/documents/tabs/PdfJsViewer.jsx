import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Same-origin worker file (hashed by Vite), so it passes the production CSP's script-src 'self'.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

const MAX_PIXEL_RATIO = 2; // sharp enough on phones without 4x-sized canvases

// One page: an empty, correctly-sized placeholder until it scrolls near the viewport,
// then rendered into a canvas. 800-page documents therefore cost 800 divs, not 800 renders.
const PdfPage = ({ doc, number, ratio, width, root, onRendered }) => {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { root, rootMargin: "800px 0px" });
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!visible || !width) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      const page = await doc.getPage(number);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: (width / base.width) * Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO) });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      await task.promise;
      if (!cancelled) {
        setRendered(true);
        onRendered?.(number);
      }
    })().catch((err) => {
      if (err?.name !== "RenderingCancelledException") console.error(`Could not render PDF page ${number}`, err);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [visible, width, doc, number, onRendered]);

  return (
    <div ref={holderRef} data-page={number} className="mx-auto mb-3 bg-white shadow-sm" style={{ width, minHeight: rendered ? undefined : width * ratio }}>
      <canvas ref={canvasRef} className="block h-auto w-full" aria-label={`Page ${number}`} role="img" />
    </div>
  );
};

// Renders a PDF (as a Blob the caller already fetched with auth) page by page.
// `page` scrolls the viewer to that page — what a clicked citation asks for.
const PdfJsViewer = ({ blob, page = null, title }) => {
  // A callback ref held in state: pages need the scroll container as their IntersectionObserver root.
  const [scroller, setScroller] = useState(null);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(false);
  const [ratio, setRatio] = useState(Math.SQRT2);
  const [width, setWidth] = useState(0);
  const [renderTick, setRenderTick] = useState(0);
  const userScrolled = useRef(false);
  const alignUntil = useRef(0);
  const onRendered = useCallback(() => setRenderTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask = null;
    (async () => {
      // Bytes, not a blob: URL — the production CSP's connect-src doesn't allow fetching blob:.
      const data = new Uint8Array(await blob.arrayBuffer());
      loadingTask = pdfjs.getDocument({ data });
      const loaded = await loadingTask.promise;
      const first = (await loaded.getPage(1)).getViewport({ scale: 1 });
      if (cancelled) return;
      setRatio(first.height / first.width);
      setDoc(loaded);
    })().catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [blob]);

  useEffect(() => {
    if (!scroller) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width) - 24));
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scroller]);

  // Jump straight to the cited page. Not smooth: easing across thousands of pixels is slow
  // and Chrome cancels it the moment a page above finishes rendering and shifts the layout.
  const jumpToPage = useCallback(() => {
    const target = scroller?.querySelector(`[data-page="${page}"]`);
    if (target) scroller.scrollTo({ top: target.offsetTop - 12, behavior: "auto" });
  }, [scroller, page]);

  useEffect(() => {
    if (!scroller || !doc || !page || !width) return;
    userScrolled.current = false;
    alignUntil.current = Date.now() + 2500;
    jumpToPage();
  }, [scroller, doc, page, width, jumpToPage]);

  // Pages near the target settle to their real heights as they render, nudging it by a few
  // pixels — keep it aligned for a moment, unless the reader has already taken over.
  useEffect(() => {
    if (page && !userScrolled.current && Date.now() < alignUntil.current) jumpToPage();
  }, [renderTick, page, jumpToPage]);

  if (error) {
    return <div className="flex h-[40vh] items-center justify-center px-6 text-center text-sm text-gray-500">This PDF couldn&apos;t be displayed. Try &ldquo;Open in new tab&rdquo;.</div>;
  }

  return (
    <div
      ref={setScroller}
      data-testid="pdfjs-viewer"
      aria-label={title}
      onWheel={() => (userScrolled.current = true)}
      onTouchStart={() => (userScrolled.current = true)}
      onPointerDown={() => (userScrolled.current = true)}
      className="relative h-[75vh] overflow-y-auto bg-gray-100 p-3 [overflow-anchor:none]"
    >
      {!doc && (
        <div className="flex h-full items-center justify-center" role="status" aria-live="polite">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary" />
          <span className="sr-only">Loading PDF</span>
        </div>
      )}
      {doc &&
        Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage key={i + 1} doc={doc} number={i + 1} ratio={ratio} width={width} root={scroller} onRendered={onRendered} />
        ))}
    </div>
  );
};

export default PdfJsViewer;
