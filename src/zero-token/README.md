# Zero Token (Web models)

This directory holds **browser-based / cookie-based “web” model** implementations for the Zero Token fork.

**Documentation (product + sync + browser modes):** see **`docs/zero-token/`** ([index](../../docs/zero-token/index.md)). **Claude Web in chat:** use `/model claude-web/claude-sonnet-4-6` (full id); see [web-models-support](../../docs/zero-token/web-models-support).

## Layout

- **`providers/`** — Site clients and auth helpers (`*-web-client*.ts`, `*-web-auth.ts`).
- **`streams/`** — `StreamFn` factories and `web-stream-factories.ts` (`model.api` → factory).
- **`extensions/askonce/`** — Bundled AskOnce plugin (multi-model “ask once” CLI); workspace package `@openclaw/askonce`.

## Core bridge (outside this folder)

- `extensions/web-models/api.ts` owns the static web provider catalog, default model ids, and shared onboarding/config helpers.
- `src/agents/models-config.providers.ts` re-exports the web provider constants/builders from `extensions/web-models/api.ts`.
- `src/commands/onboard-web-auth.ts` routes browser-backed auth through the plugin-owned `web-models` auth choices.

Prefer adding new web providers under this tree, then wiring a thin import or re-export in the files above.
