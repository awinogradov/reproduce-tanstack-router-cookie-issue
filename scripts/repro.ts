/**
 * End-to-end reproduction script.
 *
 * 1. Start `bun run dev` as a background process
 * 2. Wait for the dev server to respond on http://localhost:3001/
 * 3. POST http://localhost:3001/api/cookies
 * 4. Count the `Set-Cookie` headers on the response
 * 5. Print a human-readable summary and exit with code 0 if the count is 2,
 *    or code 1 if only 1 made it through.
 *
 * Run with: `bun run repro`
 */
import { spawn } from "node:child_process";

const port = 3001;
const baseUrl = `http://localhost:${port}`;

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

async function main(): Promise<void> {
  console.log(`[repro] starting dev server on :${port}`);
  const dev = spawn("bun", ["run", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  dev.stdout?.on("data", (chunk) => process.stdout.write(`[dev] ${chunk}`));
  dev.stderr?.on("data", (chunk) => process.stderr.write(`[dev] ${chunk}`));

  try {
    await waitForReady();
    console.log("[repro] dev server ready, sending POST /api/cookies");

    const response = await fetch(`${baseUrl}/api/cookies`, { method: "POST" });
    const setCookies = response.headers.getSetCookie();
    const debugHeader = response.headers.get("x-debug-cookies");

    console.log(`[repro] status: ${response.status}`);
    console.log(`[repro] x-debug-cookies (set by the handler): ${debugHeader}`);
    console.log(`[repro] client-visible set-cookie count:       ${setCookies.length}`);
    for (const [index, cookie] of setCookies.entries()) {
      console.log(`[repro]   [${index}] ${cookie}`);
    }

    const platform = `${process.platform}/${process.arch} bun=${process.versions.bun}`;
    if (setCookies.length === 2) {
      console.log(`[repro] PASS — both cookies reached the client on ${platform}`);
      process.exit(0);
    } else {
      console.log(`[repro] FAIL — handler set ${debugHeader} cookies, client saw ${setCookies.length} on ${platform}`);
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
