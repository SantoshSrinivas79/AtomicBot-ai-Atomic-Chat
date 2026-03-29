# Atomic Chat Newbie Guide

This is the guide I wish I had on day 1.

It is written for this repository as it exists today, with extra notes for macOS / Apple Silicon because that is the path that currently matters most in this repo.

## 1. What this project is

Atomic Chat is a desktop AI chat app built with:

- `web-app/`: React + Vite + TanStack Router frontend
- `core/`: shared TypeScript SDK and extension APIs
- `extensions/`: feature modules such as `llamacpp`, `mlx`, `foundation-models`, `rag`, `vector-db`, `assistant`, `conversational`
- `src-tauri/`: Rust Tauri backend
- `src-tauri/plugins/`: Rust plugins for hardware, MLX, llama.cpp, RAG, vector DB, foundation models
- `mlx-server/`: Swift local OpenAI-compatible server for MLX on Apple Silicon
- `foundation-models-server/`: Swift local OpenAI-compatible server for Apple Foundation Models

This is not a simple web app. It is a hybrid desktop app with three major layers:

1. frontend UI in TypeScript
2. desktop/native backend in Rust
3. local inference runtimes in Swift / Rust / external binaries

## 2. How the app is structured

### Frontend

The frontend lives in `web-app/`.

Important places:

- `web-app/src/main.tsx`: app bootstrap
- `web-app/src/routes/`: screen routing
- `web-app/src/routes/threads/$threadId.tsx`: main chat screen and tool-call follow-up logic
- `web-app/src/providers/`: app-wide providers
- `web-app/src/lib/custom-chat-transport.ts`: AI SDK chat transport logic
- `web-app/src/lib/model-factory.ts`: model creation and local SSE transport wiring
- `web-app/src/services/`: platform-specific service layer

### Shared TS core

The `core/` package defines browser/runtime abstractions:

- extension APIs
- engine interfaces
- shared types
- model and extension management helpers

### Extensions

The `extensions/` folder is where most product behavior is packaged:

- `assistant-extension`
- `conversational-extension`
- `download-extension`
- `llamacpp-extension`
- `mlx-extension`
- `foundation-models-extension`
- `rag-extension`
- `vector-db-extension`

These are installed into the app and loaded by the frontend runtime.

### Native backend

The native backend lives in `src-tauri/`.

Important responsibilities:

- app startup
- persistence
- IPC commands
- MCP orchestration
- local HTTP proxy / streaming bridge
- launching bundled runtimes

### Native plugins

`src-tauri/plugins/` contains Rust plugins for:

- hardware detection
- llama.cpp
- MLX
- vector DB
- RAG
- foundation models

## 3. The mental model that matters

When you click something in the UI, the work usually flows like this:

1. React UI triggers logic in `web-app/`
2. frontend talks to `core/` and loaded `extensions/`
3. frontend or extension calls Tauri APIs
4. Rust backend or Rust plugin does the native work
5. local model runtime or helper binary runs
6. results stream back through Tauri into the UI

If you keep that in your head, the repo becomes much easier to debug.

## 4. What to run

### First full setup

From repo root:

```bash
make dev
```

This does the heavy setup:

- installs yarn deps
- builds Tauri plugin JS APIs
- builds `core`
- builds extensions
- downloads helper binaries
- downloads llama.cpp backend
- builds MLX server when needed
- builds Foundation Models server when needed
- builds the CLI
- starts the app

### Daily development after setup

Usually:

```bash
yarn dev
```

or

```bash
yarn dev:tauri
```

On macOS, `yarn dev:tauri` now uses the mac-specific Tauri config.

### Frontend-only dev server

```bash
yarn dev:web
```

Important: this is not the same as the desktop app. The browser page at `http://localhost:1420` is missing the Tauri bridge, so some desktop-only features will fail there.

## 5. The commands you will actually use

From repo root:

```bash
make dev
make test
make clean
yarn dev
yarn dev:web
yarn workspace @janhq/web-app exec tsc --noEmit
```

Useful debugging commands:

```bash
lsof -nP -iTCP:1420 -sTCP:LISTEN
kill <PID>
```

Use those if Vite says the port is already taken.

### CLI model download helper

The local CLI now has a direct Hugging Face download helper.

From `src-tauri/`:

```bash
cargo run --features cli --bin jan-cli -- models download https://huggingface.co/janhq/Jan-v2-VL-high-4bit-mlx
```

If your installed `jan` binary is current, this also works:

```bash
jan models download janhq/Jan-v2-VL-high-4bit-mlx
jan models download unsloth/Qwen3.5-27B-GGUF
```

Notes:

- accepts either a Hugging Face URL or `owner/repo`
- auto-detects `llamacpp` vs `mlx`
- for GGUF repos, `--select` shows quantization choices
- downloaded models land in the same app data folders the desktop app uses

## 6. What each major folder is for

### If you are changing UI

Go to:

- `web-app/src/components/`
- `web-app/src/containers/`
- `web-app/src/routes/`

For the Hub / model listing page specifically:

- `web-app/src/routes/hub/index.tsx`
- `web-app/src/routes/hub/$modelId.tsx`

The Hub cards now show a copyable Hugging Face repo ID. That copied ID is meant to be directly usable in terminal commands like:

```bash
jan models download unsloth/Qwen3.5-27B-GGUF
```

### If you are changing model request/response flow

Go to:

- `web-app/src/lib/custom-chat-transport.ts`
- `web-app/src/lib/model-factory.ts`
- `extensions/llamacpp-extension/src/index.ts`
- `extensions/mlx-extension/src/index.ts`
- `src-tauri/src/core/http.rs`

### If you are changing native process startup

Go to:

- `src-tauri/src/lib.rs`
- `src-tauri/src/core/`
- `src-tauri/plugins/tauri-plugin-mlx/`
- `src-tauri/plugins/tauri-plugin-llamacpp/`

### If you are changing local MLX server behavior

Go to:

- `mlx-server/Sources/MLXServer/Server.swift`
- `mlx-server/Sources/MLXServer/ModelRunner.swift`

## 7. How local inference works here

There are multiple local model backends.

### llama.cpp

- handled through the llama.cpp extension and Rust plugin
- uses a localhost OpenAI-compatible API
- frontend uses a custom local streaming bridge for SSE

### MLX

- Apple Silicon only
- launched from the Rust MLX plugin
- actual server binary is `mlx-server`
- speaks OpenAI-compatible chat completions over localhost

### Foundation Models

- Apple on-device model path
- separate Swift server
- also exposed through a local API

## 8. Important macOS / MLX notes

These are easy to miss.

### MLX build gotcha

The MLX server must be built with `xcodebuild`, not plain `swift build`, because it needs the bundled `default.metallib`.

The Makefile now enforces this and checks for:

`src-tauri/resources/bin/mlx-swift_Cmlx.bundle/Contents/Resources/default.metallib`

If that metallib is missing, MLX will start and then fail immediately.

### MLX runtime artifacts

The build copies:

- `mlx-server`
- `mlx-swift_Cmlx.bundle`
- `swift-nio_NIOPosix.bundle`
- `swift-transformers_Hub.bundle`

### Tauri macOS config

macOS dev must use:

- `src-tauri/tauri.macos.conf.json`

That config now explicitly includes the MLX bundle directories.

### MLX unsupported model types

If MLX logs something like:

```text
Unsupported model type: qwen3_5
```

that is usually not a bad download. It means the bundled `mlx-swift-lm` in this repo does not support that architecture yet.

How to think about it:

- if the model folder has `config.json`, tokenizer files, and `model.safetensors` / `model.safetensors.index.json`, the import may still be fine
- the failure happens later when the Swift MLX runtime tries to instantiate the architecture
- fixing that requires either:
  - using a supported MLX model
  - or upgrading / patching the bundled MLX Swift dependencies

The Rust MLX plugin now reports this more clearly instead of collapsing it into a generic process error.

## 9. Logs that look scary but are not bugs

### NVIDIA / NVML log on macOS

Example:

`Unable to initialize NVML: ... nvml.dll ...`

Meaning:

- the hardware plugin checked for NVIDIA support
- your Mac does not have NVML
- not a real failure

We changed the hardware plugin to skip NVIDIA probing on macOS, so this log should now disappear or be replaced with a short skip message.

### Vulkan probe skipped on macOS

Example:

`Skipping Vulkan GPU probe on macOS`

That is expected. macOS inference is using Metal, not Vulkan.

### `SSE continuation terminated, cancelling task`

From the MLX server:

- this usually means the client finished consuming the stream and disconnected
- by itself, this is not a server crash

## 10. One important frontend streaming gotcha

Local SSE streaming through Tauri is tricky.

There is a known workaround in:

- `web-app/src/lib/model-factory.ts`
- `src-tauri/src/core/http.rs`

The important function is `createLocalStreamingFetch(...)`.

Why it exists:

- normal localhost fetch in the desktop webview can fail to deliver SSE chunks reliably
- the app uses a Tauri IPC channel to relay local streaming bytes back to the UI

This is already used for llama.cpp.
It now also needs to be used for MLX to avoid "server generated but UI hung" behavior.

## 11. Tool calling is part of the chat flow

This app does not treat tool calling as an addon. It is built into the chat loop.

Important files:

- `web-app/src/routes/threads/$threadId.tsx`
- `web-app/src/hooks/useTools.ts`
- `web-app/src/services/mcp/tauri.ts`

What happens:

1. model streams an assistant reply
2. if the reply contains tool calls, they are captured
3. the app executes those tools
4. tool outputs are added back into the conversation
5. the app auto-sends a follow-up request

If a chat "stops early", always ask:

- did the model return tool calls?
- did the tool approval modal appear?
- did tool execution fail?
- did the follow-up request fire?

## 12. Browser tools note

The stable local browser-tools path in this repo currently uses Playwright MCP through `npx`, not Bun.

Important details:

- `Local Browser MCP` runs `@playwright/mcp`
- on macOS it prefers installed local Chrome
- this is intentional because the Bun runtime path could open the browser but still hang on `browser_navigate`
- if browser tools suddenly stop navigating, check Node / `npx` first

If you see:

```text
Tool call 'browser_navigate' timed out after 90 seconds
```

check:

- whether `Local Browser MCP` is active
- whether `node` / `npx` exists on your machine
- whether restarting the app or toggling the MCP server fixes it
- whether the problem is specific to a site like Google versus a simple URL like `https://example.com`

## 13. A good debugging workflow

When something breaks, do not guess. Narrow the layer first.

### If the UI looks wrong

Check:

- `web-app/src/routes/`
- browser/devtools console
- React state / stores

### If the request starts but no answer renders

Check:

- `web-app/src/lib/custom-chat-transport.ts`
- `web-app/src/lib/model-factory.ts`
- extension streaming parser
- whether the model produced tool calls instead of plain text

### If model launch fails

Check:

- Rust plugin logs
- bundled binary path
- resource bundles
- port conflicts

### If Tauri app works but browser localhost fails

That may be expected. The desktop app has Tauri APIs that a plain browser page does not.

## 14. What I would inspect first for common problems

### Problem: app will not start

Check:

- Node version
- Rust toolchain
- port `1420`
- `make dev` output

### Problem: MLX model loads but chat hangs

Check:

- MLX server startup logs
- whether frontend is using local SSE bridge
- whether the model produced tool calls
- tool approval / MCP tool execution

### Problem: browser tools open Chrome but do not navigate

Check:

- whether `Local Browser MCP` is running through `npx @playwright/mcp`
- whether the app is using local Chrome on macOS
- whether `browser_navigate` is timing out
- whether a simple URL works before testing Google or other bot-sensitive pages

### Problem: local model missing

Check:

- model path under `~/Library/Application Support/Atomic Chat/data/...`
- provider config
- session lookup in Rust plugin

### Problem: UI in browser looks broken compared to desktop app

Likely reason:

- you opened `http://localhost:1420` directly in a browser
- the browser page does not have `window.core` or Tauri IPC

## 15. How hot reload behaves

### Frontend changes

Edits in `web-app/` usually hot reload.

### Rust changes

Edits in `src-tauri/` trigger rebuild/restart through Tauri dev flow.

### Build script / runtime packaging changes

Changes to Makefile, Tauri configs, bundled binaries, or Swift servers often require a clean restart of the dev process.

## 16. Where data lives locally

During desktop usage, app data is under:

`~/Library/Application Support/Atomic Chat/`

That is where you will see:

- installed extensions
- downloaded models
- runtime data

This is useful when debugging whether the app is using repo-local resources or installed app data.

## 17. Things I would not waste time on as a newbie

- random peer dependency warnings unless they actually block a build
- Vulkan skip logs on macOS
- old Jan naming in code unless you are already touching the file
- trying to debug desktop behavior from the plain browser page alone
- Xcode build cache under `mlx-server/.build-xcode/`

## 18. Safe first tasks

Good beginner tasks:

- UI copy changes
- small route/component fixes in `web-app/`
- log cleanup
- docs improvements
- one extension at a time
- one plugin at a time

Harder tasks:

- model streaming bugs
- cross-runtime changes touching TS + Rust + Swift
- MCP orchestration
- packaging / signing / resource bundle issues

## 19. Practical advice

- Start from the failing log line and identify the layer first.
- Use `rg` to find where a log string is emitted.
- Keep browser-only and Tauri-desktop behavior separate in your head.
- For local model issues, always inspect both frontend and native logs.
- For MLX on macOS, think about bundles and metallib before blaming the model itself.

## 19. Personal short checklist before changing code

- What layer is failing: UI, extension, Tauri backend, plugin, or local model server?
- Is this browser-only behavior or true desktop behavior?
- Is the stream text, tool-call, or transport related?
- Does the repo already have a workaround in another backend that I can copy?
- Can I prove the bug with logs before editing?

## 20. If I were starting fresh tomorrow

I would do this:

1. run `make dev` once
2. after that, use `yarn dev` for day-to-day work
3. learn `web-app/src/routes/threads/$threadId.tsx`
4. learn `web-app/src/lib/model-factory.ts`
5. learn `src-tauri/src/lib.rs`
6. learn the plugin for the backend I care about
7. keep `rg` open and follow log strings instead of guessing

That is enough to become productive in this repo quickly.
