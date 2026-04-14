/**
 * Minimal reproduction route for TanStack/router#7189.
 *
 * Returns a 200 Response whose headers contain two `Set-Cookie` entries.
 * Expected: the client receives both. Observed on Linux CI + Bun 1.3.9: the
 * client receives only the second (`b=2`).
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
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers,
        });
      },
    },
  },
});
