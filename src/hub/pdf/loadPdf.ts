import type { renderSummaryPdf } from "./renderSummaryPdf";

export interface PdfModule {
  renderSummaryPdf: typeof renderSummaryPdf;
}

declare global {
  interface Window {
    tictaskPdf?: PdfModule;
  }
}

let loading: Promise<PdfModule> | null = null;

/**
 * jsPDF lives in its own bundle (dist/pdf.js, next to hub.html): it is loaded on the first export,
 * so the hub does not carry it on every page load.
 */
export function loadPdf(): Promise<PdfModule> {
  if (window.tictaskPdf) return Promise.resolve(window.tictaskPdf);
  loading ??= new Promise<PdfModule>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "pdf.js";
    script.onload = () => (window.tictaskPdf ? resolve(window.tictaskPdf) : reject(new Error("O gerador de PDF não carregou.")));
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Não foi possível carregar o gerador de PDF. Recarregue a página e tente de novo."));
    };
    document.head.appendChild(script);
  });
  return loading;
}
