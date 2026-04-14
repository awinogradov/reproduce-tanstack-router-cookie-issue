# Reproduce — TanStack Start duplicate `Set-Cookie` drop on Linux Bun

Minimal reproduction for [TanStack/router#7189](https://github.com/TanStack/router/issues/7189).

A TanStack Start API route returns a `Response` whose headers contain two `Set-Cookie` entries. On **macOS + Bun 1.3.9** both cookies reach the client. On **Linux CI + Bun 1.3.9** only one does.

## What the repro does

- `src/routes/api/cookies.ts` — a single POST handler that builds a `Headers` object, appends two `Set-Cookie` values, and returns a 200 `Response`. It also sets an `x-debug-cookies` response header with the cookie count at return time, so you can see what the handler sent vs what the client received.
- `scripts/repro.ts` — boots the TanStack Start dev server via `bun run dev`, waits for `http://localhost:3001/` to respond, sends one `POST /api/cookies`, then reads `response.headers.getSetCookie()` and exits 0 if the count is 2, 1 if the count is less. The `x-debug-cookies` header is logged alongside the client-visible count.
- `.github/workflows/repro.yml` — runs the script on both `ubuntu-latest` and `macos-latest` GitHub runners with Bun 1.3.9. The macOS job passes; the ubuntu job fails.

## Run locally

```bash
bun install
bun run repro
```

Expected on **macOS**:

```
[repro] x-debug-cookies (set by the handler): 2
[repro] client-visible set-cookie count:       2
[repro]   [0] a=1; Path=/; HttpOnly; SameSite=Lax
[repro]   [1] b=2; Path=/; HttpOnly; SameSite=Lax
[repro] PASS — both cookies reached the client on darwin/arm64 bun=1.3.9
```

Observed on **GitHub Actions `ubuntu-latest`**:

```
[repro] x-debug-cookies (set by the handler): 2
[repro] client-visible set-cookie count:       1
[repro]   [0] b=2; Path=/; HttpOnly; SameSite=Lax
[repro] FAIL — handler set 2 cookies, client saw 1 on linux/x64 bun=1.3.9
```

## Affected versions (from `package.json`)

- `@tanstack/react-start` `1.167.34`
- `@tanstack/react-start-server` `1.166.37` (transitive)
- `@tanstack/start-server-core` `1.167.18` (transitive)
- `@tanstack/react-router` `1.168.19`
- `@tanstack/router-plugin` `1.167.20`
- `h3` `2.0.1-rc.20` (transitive)
- `bun` `1.3.9`

## What we tried downstream (FRONT-13 context)

Discovered while wiring [BetterAuth](https://github.com/better-auth/better-auth) into a TanStack Start app. BetterAuth sets a `session_token` and a `session_data` cookie on successful sign-in; on Linux CI only `session_data` survived, so the opaque session token was missing and every session lookup failed.

Things that did **not** fix the drop:

1. Explicitly rebuilding the `Response` from `headers.getSetCookie()` and re-appending each value via `headers.append("set-cookie", …)`.
2. Removing BetterAuth's `tanstackStartCookies` plugin (which writes cookies into the h3 event via `setCookie` from `@tanstack/react-start/server`).

What **does** work as a workaround: emit only a single `Set-Cookie` header. The bug is specific to duplicate `Set-Cookie` entries, not to any particular cookie name or payload.

## Suspect code paths

Not proven to be the bug, but where the trail went cold:

- [`@tanstack/start-server-core@1.167.18/src/request-response.ts`](https://github.com/TanStack/router/blob/main/packages/start-server-core/src/request-response.ts) — `mergeEventResponseHeaders` early-returns when `response.ok` is true, and `getSetCookieValues` falls back to `headers.get("set-cookie")` when `getSetCookie` is missing.
- `h3@2.0.1-rc.20` — `prepareResponse` → `mergeHeaders$1`. For 2xx responses it merges `preparedHeaders` into `val.headers` via `target.append("set-cookie", …)`, which should preserve duplicates but does not in CI.
- `better-auth/dist/integrations/tanstack-start.mjs` — uses `headers.get("set-cookie")` (single-value) rather than `headers.getSetCookie()`. Even removing this plugin entirely doesn't fix the drop, so it is not the primary cause.

## License

MIT — this repo exists purely as a bug reproduction.
