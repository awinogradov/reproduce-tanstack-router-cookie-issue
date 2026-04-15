/**
 * End-to-end reproduction script.
 *
 * 1. Start `bun run dev` as a background process
 * 2. Wait for the dev server to respond on http://localhost:3001/
 * 3. POST http://localhost:3001/api/cookies via Bun's `fetch`, and again via a
 *    raw TCP socket. The raw socket bypass lets us tell whether the cookies
 *    are missing on the wire or only after `fetch` has parsed them.
 * 4. Report both views and exit non-zero if the number of wire `Set-Cookie:`
 *    lines is less than the `x-debug-cookies` count the handler emitted.
 *
 * Run with: `bun run repro`
 */
import { spawn } from "node:child_process";
import { Socket } from "node:net";
import { promises as dns } from "node:dns";

const port = 3001;
const baseUrl = `http://localhost:${port}`;

async function resolveRawHosts(): Promise<Array<string>> {
  const results = await dns.lookup("localhost", { all: true });
  const addresses = results.map((r) => r.address);
  if (!addresses.includes("127.0.0.1")) addresses.push("127.0.0.1");
  if (!addresses.includes("::1")) addresses.push("::1");
  return addresses;
}

async function waitForReady(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status < 500) {
        return;
      }
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Dev server did not become ready within ${timeoutMs}ms`);
}

function rawSocketPost(host: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
    });
    socket.on("end", () => resolve(buffer));
    socket.on("error", reject);
    socket.connect(port, host, () => {
      const request = [
        `POST ${path} HTTP/1.1`,
        `Host: localhost:${port}`,
        `Origin: http://localhost:${port}`,
        `User-Agent: raw-socket-repro/1.0`,
        `Accept: */*`,
        `Connection: close`,
        `Content-Length: 0`,
        "",
        "",
      ].join("\r\n");
      socket.write(request);
    });
  });
}

async function main(): Promise<void> {
  console.log(`[repro] starting dev server on :${port}`);
  const dev = spawn("npm", ["run", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
    shell: process.platform === "win32",
  });
  dev.stdout?.on("data", (chunk) => process.stdout.write(`[dev] ${chunk}`));
  dev.stderr?.on("data", (chunk) => process.stderr.write(`[dev] ${chunk}`));

  try {
    await waitForReady();
    console.log("[repro] dev server ready, sending POST /api/cookies");

    // --- Bun fetch() view ------------------------------------------------
    const response = await fetch(`${baseUrl}/api/cookies`, { method: "POST" });
    const fetchSetCookies = response.headers.getSetCookie();
    const debugHeader = response.headers.get("x-debug-cookies");

    console.log(`[repro] [fetch] status:                ${response.status}`);
    console.log(`[repro] [fetch] x-debug-cookies:       ${debugHeader}`);
    console.log(`[repro] [fetch] getSetCookie().length: ${fetchSetCookies.length}`);
    for (const [index, cookie] of fetchSetCookies.entries()) {
      console.log(`[repro] [fetch]   [${index}] ${cookie}`);
    }

    // --- Raw TCP socket view --------------------------------------------
    const hosts = await resolveRawHosts();
    let raw: string | undefined;
    let rawHostUsed: string | undefined;
    for (const host of hosts) {
      try {
        console.log(`[repro] opening raw tcp socket to ${host}:${port}`);
        raw = await rawSocketPost(host, "/api/cookies");
        rawHostUsed = host;
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[repro]   (skip ${host}: ${msg})`);
      }
    }
    if (!raw || !rawHostUsed) {
      throw new Error(`raw tcp: unable to connect to any of ${hosts.join(", ")}`);
    }
    const headersBlock = raw.split("\r\n\r\n", 1)[0] ?? "";
    const rawSetCookies = headersBlock
      .split("\r\n")
      .filter((line) => line.toLowerCase().startsWith("set-cookie:"))
      .map((line) => line.slice("set-cookie:".length).trim());

    console.log(`[repro] [raw]   set-cookie lines on the wire: ${rawSetCookies.length}`);
    for (const [index, cookie] of rawSetCookies.entries()) {
      console.log(`[repro] [raw]     [${index}] ${cookie}`);
    }
    console.log(`[repro] [raw]   --- full header block ---`);
    for (const line of headersBlock.split("\r\n")) {
      console.log(`[repro] [raw]   | ${line}`);
    }

    const runtime = process.versions.bun
      ? `bun=${process.versions.bun}`
      : `node=${process.versions.node}`;
    const platform = `${process.platform}/${process.arch} ${runtime}`;
    const expected = Number(debugHeader ?? "0");
    const wireOk = rawSetCookies.length === expected;
    const fetchOk = fetchSetCookies.length === expected;

    if (wireOk && fetchOk) {
      console.log(`[repro] PASS — handler emitted ${expected} cookies, wire saw ${rawSetCookies.length}, fetch saw ${fetchSetCookies.length} on ${platform}`);
      process.exit(0);
    } else {
      console.log(`[repro] FAIL — handler emitted ${expected} cookies, wire saw ${rawSetCookies.length}, fetch saw ${fetchSetCookies.length} on ${platform}`);
      process.exit(1);
    }
  } finally {
    dev.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

main().catch((error) => {
  console.error("[repro] unexpected error:", error);
  process.exit(2);
});
