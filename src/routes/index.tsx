import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <main>
      <h1>Reproduce: TanStack Start duplicate Set-Cookie drop on Linux Bun</h1>
      <p>
        POST <code>/api/cookies</code> — the handler returns a Response with two Set-Cookie
        entries. On macOS + Bun both reach the client. On Linux CI only one does.
      </p>
      <p>
        See <a href="https://github.com/TanStack/router/issues/7189">TanStack/router#7189</a>.
      </p>
    </main>
  );
}
