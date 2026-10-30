// Separate bundle (dist/pdf.js), loaded by the hub only when a PDF is exported: see hub/pdf/loadPdf.ts.
import { renderSummaryPdf } from "../hub/pdf/renderSummaryPdf";

window.tictaskPdf = { renderSummaryPdf };
