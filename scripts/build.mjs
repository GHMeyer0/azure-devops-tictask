// Bundles each contribution page (src/pages/*.tsx) into dist/<page>.js + dist/<page>.html, plus
// dist/pdf.js, loaded on demand by the hub.
import * as esbuild from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";

const args = new Set(process.argv.slice(2));
const dev = args.has("--dev");
const watch = args.has("--watch");

const pages = {
  group: "TicTask",
  tab: "TicTask - Apontamentos",
  hub: "TicTask",
  dialog: "TicTask",
  panel: "TicTask",
};

const html = (page, title) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; overflow-x: hidden; font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
    body.page-hub, body.page-tab { min-height: 100vh; }
  </style>
</head>
<body class="page-${page}">
  <div id="root"></div>
  <script src="${page}.js"></script>
</body>
</html>
`;

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await Promise.all(Object.entries(pages).map(([page, title]) => writeFile(`dist/${page}.html`, html(page, title))));

const options = {
  // pdf.js has no page of its own: the hub loads it when a PDF is exported (hub/pdf/loadPdf.ts).
  entryPoints: { ...Object.fromEntries(Object.keys(pages).map((p) => [p, `src/pages/${p}.tsx`])), pdf: "src/pages/pdf.ts" },
  // Optional jsPDF dependencies, only used by doc.html() and SVG: never called here.
  external: ["html2canvas", "canvg", "dompurify"],
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  minify: !dev,
  sourcemap: dev ? "inline" : false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
