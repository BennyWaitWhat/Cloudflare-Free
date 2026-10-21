// Saves every interactive diagram in public/learn as light and dark WebP images in
// ../docs/images/diagrams, for the guide in docs/how-it-works.md, plus small thumbnails in
// public/diagrams for the How it works page. It presses each page's own Export → WebP button, so the
// images match what a reader downloads, minus the title row: the headings around each picture
// already name the diagram. Run `npm run diagrams:images`.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./chrome.mjs";

const LEARN = fileURLToPath(new URL("../public/learn/", import.meta.url));
const OUT = fileURLToPath(new URL("../../docs/images/diagrams/", import.meta.url));
const THUMBS = fileURLToPath(new URL("../public/diagrams/", import.meta.url));
// The viewer exports at 4x the diagram's size; 2x stays sharp on high-density screens.
const SCALE = 2;
// The How it works cards show thumbnails 350 to 800px wide; 720px keeps them sharp at about 25 KB each.
const THUMB_WIDTH = 720;
const QUALITY = 0.9;
const CORNER_RADIUS = 24;

// Keeps the file behind each download link instead of saving it, so the export can be read back.
const CAPTURE_DOWNLOADS = `(() => {
  const files = new Map();
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    const url = createObjectURL.call(URL, blob);
    files.set(url, blob);
    return url;
  };
  const click = HTMLAnchorElement.prototype.click;
  window.downloads = [];
  HTMLAnchorElement.prototype.click = function () {
    if (!this.download) return click.call(this);
    window.downloads.push({ name: this.download, blob: files.get(this.href) });
  };
  return true;
})()`;

const EXPORT_WEBP = `document.querySelector('.export-menu button[data-format="webp"]').click()`;
const EXPORTED = `document.documentElement.dataset.lastExportFormat === "webp" && window.downloads.length > 0`;

// Shrinks the export to targetWidth, or to SCALE times the diagram's width when that is 0, keeping
// the export's own proportions. Then rounds its corners and returns it as base64.
const shrink = (targetWidth = 0) => `(async () => {
  const bitmap = await createImageBitmap(window.downloads.at(-1).blob);
  const box = document.querySelector(".diagram-container svg").viewBox.baseVal;
  const width = Math.round(${targetWidth} || box.width * ${SCALE});
  const height = Math.round((width * bitmap.height) / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.beginPath();
  context.roundRect(0, 0, width, height, ${CORNER_RADIUS});
  context.clip();
  context.drawImage(bitmap, 0, 0, width, height);
  const webp = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", ${QUALITY}));
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(webp);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
})()`;

async function exportDiagram(page, file, scheme) {
  await page.open(pathToFileURL(join(LEARN, file)).href, { width: 1440, height: 900, scale: 1, scheme });
  const theme = await page.evaluate("document.documentElement.dataset.theme");
  if (theme !== scheme) throw new Error(`${file} opened in the ${theme} theme instead of ${scheme}`);
  await page.evaluate(CAPTURE_DOWNLOADS);
  // An empty title leaves the title row out of the export.
  await page.evaluate("document.querySelector('.header h1').textContent = ''");
  await page.evaluate(EXPORT_WEBP);
  await page.waitFor(EXPORTED);
  if ((await page.evaluate("document.documentElement.dataset.lastExportCanonical")) !== "true") {
    throw new Error(`${file} exported viewer state along with the diagram`);
  }
  const full = Buffer.from(await page.evaluate(shrink()), "base64");
  const thumb = Buffer.from(await page.evaluate(shrink(THUMB_WIDTH)), "base64");
  return { full, thumb };
}

const kilobytes = (bytes) => Math.round(bytes.length / 1024);

async function main() {
  // Skips the visual-check reports Archify writes next to each diagram.
  const files = readdirSync(LEARN).filter((file) => /^[\w-]+\.html$/.test(file));
  if (files.length === 0) throw new Error("No diagrams found in public/learn");
  mkdirSync(OUT, { recursive: true });
  mkdirSync(THUMBS, { recursive: true });
  const { page, close } = await launch();
  try {
    for (const file of files) {
      for (const scheme of ["light", "dark"]) {
        const { full, thumb } = await exportDiagram(page, file, scheme);
        const name = `${file.slice(0, -".html".length)}-${scheme}.webp`;
        writeFileSync(join(OUT, name), full);
        writeFileSync(join(THUMBS, name), thumb);
        console.log(`docs/images/diagrams/${name}: ${kilobytes(full)} KB, thumbnail ${kilobytes(thumb)} KB`);
      }
    }
  } finally {
    await close();
  }
}

await main();
