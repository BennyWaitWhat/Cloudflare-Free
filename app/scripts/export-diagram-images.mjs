// Saves every interactive diagram in public/learn as light and dark WebP images in
// ../docs/images/diagrams, for the guide in docs/how-it-works.md. It presses each page's own
// Export → WebP button, so the images match what a reader downloads. Run `npm run diagrams:images`.
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "./chrome.mjs";

const LEARN = fileURLToPath(new URL("../public/learn/", import.meta.url));
const OUT = fileURLToPath(new URL("../../docs/images/diagrams/", import.meta.url));
// The viewer exports at 4x the diagram's size; 2x stays sharp on high-density screens.
const SCALE = 2;
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

// Shrinks the export to SCALE, rounds its corners and returns it as base64.
const SHRINK = `(async () => {
  const box = document.querySelector(".diagram-container svg").viewBox.baseVal;
  const width = Math.round(box.width * ${SCALE});
  const height = Math.round(box.height * ${SCALE});
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.beginPath();
  context.roundRect(0, 0, width, height, ${CORNER_RADIUS});
  context.clip();
  context.drawImage(await createImageBitmap(window.downloads.at(-1).blob), 0, 0, width, height);
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
  await page.evaluate(EXPORT_WEBP);
  await page.waitFor(EXPORTED);
  if ((await page.evaluate("document.documentElement.dataset.lastExportCanonical")) !== "true") {
    throw new Error(`${file} exported viewer state along with the diagram`);
  }
  return Buffer.from(await page.evaluate(SHRINK), "base64");
}

async function main() {
  // Skips the visual-check reports Archify writes next to each diagram.
  const files = readdirSync(LEARN).filter((file) => /^[\w-]+\.html$/.test(file));
  if (files.length === 0) throw new Error("No diagrams found in public/learn");
  mkdirSync(OUT, { recursive: true });
  const { page, close } = await launch();
  try {
    for (const file of files) {
      for (const scheme of ["light", "dark"]) {
        const bytes = await exportDiagram(page, file, scheme);
        const name = `${file.slice(0, -".html".length)}-${scheme}.webp`;
        writeFileSync(join(OUT, name), bytes);
        console.log(`docs/images/diagrams/${name}: ${Math.round(bytes.length / 1024)} KB`);
      }
    }
  } finally {
    await close();
  }
}

await main();
