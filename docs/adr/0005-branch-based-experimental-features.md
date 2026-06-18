# Branch-based isolation for experimental features

Experimental features that aren't ready for the beta build are developed on their own git branch and tested locally via `bun run dev:tm`, never merged until ready to ship. They are never present in the working tree used to build standard or beta releases.

## Considered Options

- **Runtime build flag** (e.g. a `__EXPERIMENTAL__` constant injected via Vite's `define`, gating code with `if (__EXPERIMENTAL__) { ... }`): rejected because the current build config sets `minify: false` unconditionally, so the guarded code would still ship inert inside the beta/standard bundle rather than being absent — unacceptable since experimental code must not be exposed to users at all, even inert.
- **Separate entry point** (`src/index.dev.ts` importing experimental modules, `src/index.ts` not): would achieve true exclusion via the unbuilt import graph without needing minification, but was rejected in favor of branch-based isolation to avoid the ongoing convention risk of routing every new experimental module through the right entry file.
