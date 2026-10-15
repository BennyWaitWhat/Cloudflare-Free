// Drives a headless Chrome or Edge over the DevTools protocol, with no dependencies.
// Used by make-readme-images.mjs. Set CHROME_PATH if the browser isn't found.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BROWSERS = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

/** Starts a headless browser with a fresh profile and returns one page plus close(). */
export async function launch() {
  const executable = BROWSERS.find((path) => path && existsSync(path));
  if (!executable) throw new Error("Chrome or Edge wasn't found; set CHROME_PATH to its executable");
  const profile = mkdtempSync(join(tmpdir(), "headless-"));
  const browser = spawn(
    executable,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--mute-audio",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const exited = new Promise((resolve) => browser.once("exit", resolve));

  // The browser writes its DevTools port and path to this file once it is listening.
  const portFile = join(profile, "DevToolsActivePort");
  let endpoint;
  for (let attempt = 0; attempt < 150 && !endpoint; attempt++) {
    await sleep(100);
    const [port, path] = existsSync(portFile) ? readFileSync(portFile, "utf8").split("\n") : [];
    if (port && path) endpoint = `ws://127.0.0.1:${port.trim()}${path.trim()}`;
  }
  if (!endpoint) throw new Error("The browser didn't start");

  const connection = await connect(endpoint);
  const { targetId } = await connection.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await connection.send("Target.attachToTarget", { targetId, flatten: true });
  const page = new Page(connection, sessionId);
  await page.send("Page.enable");
  await page.send("Network.enable");

  return {
    page,
    async close() {
      await connection.send("Browser.close").catch(() => undefined);
      connection.close();
      await Promise.race([exited, sleep(5_000)]);
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    },
  };
}

async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let lastId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id === undefined) {
      for (const listener of listeners) listener(message);
      return;
    }
    const call = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
    else call.resolve(message.result);
  });
  return {
    send(method, params = {}, sessionId) {
      const id = ++lastId;
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => pending.set(id, { method, resolve, reject }));
    },
    listen(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => socket.close(),
  };
}

export class Page {
  constructor(connection, sessionId) {
    this.connection = connection;
    this.sessionId = sessionId;
  }

  send(method, params) {
    return this.connection.send(method, params, this.sessionId);
  }

  /** Calls handler with the params of every `method` event from this page. */
  on(method, handler) {
    return this.connection.listen((message) => {
      if (message.sessionId === this.sessionId && message.method === method) handler(message.params);
    });
  }

  next(method, timeout = 30_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        stop();
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeout);
      const stop = this.on(method, (params) => {
        clearTimeout(timer);
        stop();
        resolve(params);
      });
    });
  }

  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }

  /** Polls a page expression until it is truthy; errors such as a missing element count as "not yet". */
  async waitFor(expression, timeout = 20_000) {
    const deadline = Date.now() + timeout;
    // Boolean() because elements can't be returned by value.
    while (!(await this.evaluate(`Boolean(${expression})`).catch(() => false))) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${expression}`);
      await sleep(150);
    }
  }

  /** Loads a URL in a viewport of the given size, color scheme and pixel density. */
  async open(url, { width, height, scale = 2, mobile = false, scheme = "light", transparent = false }) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
    await this.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await this.send("Emulation.setDefaultBackgroundColorOverride", transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    const loaded = this.next("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
    await this.evaluate("document.fonts.ready.then(() => true)");
  }

  /** Replaces the current document with this HTML. */
  async setContent(html) {
    const { frameTree } = await this.send("Page.getFrameTree");
    await this.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
    await this.evaluate("document.fonts.ready.then(() => true)");
  }

  /** Captures the viewport, or only `clip` ({ x, y, width, height } in CSS pixels). */
  async screenshot({ format = "png", quality, clip } = {}) {
    const { data } = await this.send("Page.captureScreenshot", {
      format,
      quality,
      clip: clip && { ...clip, scale: 1 },
      captureBeyondViewport: Boolean(clip),
    });
    return Buffer.from(data, "base64");
  }
}
