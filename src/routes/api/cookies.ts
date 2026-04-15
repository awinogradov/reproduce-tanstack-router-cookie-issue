/**
 * Minimal reproduction route for TanStack/router#7189.
 *
 * Returns a 200 Response whose headers contain two `Set-Cookie` entries.
 * Expected: the client receives both. Observed on Linux CI + Bun 1.3.9: the
 * client receives only the second (`b=2`).
 *
 * Instrumented: response headers are snapshot into `x-debug-*` headers so
 * we can see what `[...headers]`, `headers.getSetCookie()`, and
 * `headers.get("set-cookie")` each produce on the runtime that hit the drop.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cookies")({
  server: {
    handlers: {
      POST: () => {
        const headers = new Headers();
        headers.append("set-cookie", "a=1; Path=/; HttpOnly; SameSite=Lax");
        headers.append("set-cookie", "b=2; Path=/; HttpOnly; SameSite=Lax");
        headers.set("x-debug-cookies", String(headers.getSetCookie().length));
        headers.set("x-debug-get-set-cookie", headers.get("set-cookie") ?? "<null>");
        headers.set(
          "x-debug-spread-iter",
          JSON.stringify(
            [...headers]
              .filter(([k]) => k.toLowerCase() === "set-cookie")
              .map(([, v]) => v)
          )
        );
        headers.set(
          "x-debug-getsetcookie",
          JSON.stringify(headers.getSetCookie())
        );
        headers.set("x-debug-runtime", typeof Bun === "undefined" ? `node=${process.versions.node}` : `bun=${process.versions.bun}`);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers,
        });
      },
    },
  },
});
