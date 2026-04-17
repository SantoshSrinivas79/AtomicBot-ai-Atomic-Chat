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
yarn dev:tauri:fast
```

If you prefer the repo launcher wrapper:

```bash
./start.sh --dev
```

On macOS, `yarn dev` now uses the fast Tauri path:

- reuses existing local binaries when present
- skips icon regeneration
- avoids the heavier full build/bootstrap path

Use the heavier path only when you actually need it:

```bash
yarn dev:tauri:full
```

Or:

```bash
./start.sh --dev-full
```

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

### Ollama and other local OpenAI-compatible providers

This repo now has a first-class `ollama` provider, but the important lesson is broader:
local OpenAI-compatible providers behave differently from cloud providers and need their own transport assumptions.

Important defaults:

- Ollama base URL is `http://127.0.0.1:11434/v1`
- local providers may not need an API key
- model discovery happens through `GET /v1/models`
- chat requests go through `POST /v1/chat/completions`

Important implementation notes:

- `web-app/src/constants/providers.ts` defines the built-in `ollama` provider
- `web-app/src/providers/DataProvider.tsx` must allow loopback providers to register even when `api_key` is empty
- `web-app/src/providers/DataProvider.tsx` also auto-imports model IDs for active local providers whose model list is still empty
- `web-app/src/services/providers/tauri.ts` should prefer browser/webview `fetch` for local `/models` requests and only fall back to Tauri HTTP with a timeout
- `web-app/src/lib/model-factory.ts` should prefer browser/webview `fetch` first for local OpenAI-compatible chat requests too; Tauri HTTP can succeed at the network layer and still leave the UI spinner hanging

Checklist for adding a new local OpenAI-compatible provider:

1. Add the provider definition in `web-app/src/constants/providers.ts`, including a localhost-safe default base URL.
2. Make sure `web-app/src/providers/DataProvider.tsx` can register the provider even if `api_key` is empty or uses a dummy local key.
3. Auto-import models from `GET /models` or `GET /v1/models` when the provider is active and the stored model list is empty.
4. Route local model-list requests through browser/webview `fetch` first, with a timed Tauri fallback instead of an unbounded spinner.
5. Route local chat/completions requests through browser/webview `fetch` first as well; do not assume the cloud-provider transport path is safe for localhost servers.
6. Add per-model settings if the runtime has meaningful local knobs such as `thinking`, `reasoning_effort`, `max_tokens`, or runtime-specific options.
7. Test both packaged-app and dev-app flows. A successful `web-app` build alone does not prove the already-open packaged app is using the new code.
8. Validate the integration in four steps: terminal curl works, model appears in provider settings, model appears in the picker, and a streamed chat response renders in the UI.

Two specific Ollama lessons from this repo:

1. If Ollama logs `POST /v1/chat/completions 200` but Atomic Chat still spins, the problem is probably frontend transport or stream handling, not Ollama.
2. Some thinking-capable Ollama models, including `qwen3:4b`, can stream mostly or only `delta.reasoning` on the OpenAI-compatible path. That can make the UI look blank even though the model is actively responding.

Because of that, local provider debugging should always separate:

- server availability
- model load success
- model discovery success
- request transport success
- streamed response rendering success

### VMLX and JANG models

If we add JANG support, treat it as a separate local runtime path.

Do not treat JANG folders as:

- standard `llamacpp` / GGUF models
- standard bundled `mlx-server` models
- normal cloud-style remote providers

JANG models are MLX-native safetensors with JANG-specific metadata such as `jang_config.json`.
That means they need a JANG-aware runtime.

The runtime assumption for this branch is:

- use `vMLX` (`vmlx`) as the server
- expose it to Atomic Chat through its localhost OpenAI-compatible API
- keep the model root configurable, but default to:
  `/Volumes/Extreme Pro/lmstudio/models/JANGQ-AI`

Primary source notes:

- `vmlx` is an OpenAI-compatible Apple Silicon server and CLI
- it exposes `base_url=http://localhost:<port>/v1`
- it can inspect local JANG folders directly via `vmlx info`, `vmlx list`, and `vmlx doctor`
- the server should be launched with `--served-model-name local` so the client can consistently call `model="local"`
- it supports continuous batching, paged cache, KV-cache quantization, speculative decoding, and reasoning/tool parsers
- current public examples use `model="local"` in OpenAI-compatible client calls, not `model="default"`

What is actually in the current JANG model root:

- `Qwen3.5-9B-JANG_4S`
- `Qwen3.5-27B-JANG_4S`
- `Qwen3.5-35B-A3B-JANG_4K`
- `Nemotron-Cascade-2-30B-A3B-JANG_4M`

These folders contain the expected JANG-style signatures:

- `config.json`
- `tokenizer.json` / tokenizer config files
- sharded `model-*.safetensors`
- `model.safetensors.index.json`
- `jang_config.json`

Current machine-specific findings:

- the local `vmlx` install was stale and needed an upgrade before testing; the upgraded tool is `vmlx 1.3.35`
- the Qwen3.5 JANG folders also needed the `vision` extra installed (`vmlx[vision]`) because the correct load path uses the MLLM stack
- the external model root had macOS AppleDouble sidecar files (`._*`) that broke `vmlx doctor` until the folder was cleaned with `dot_clean -m`
- `vmlx doctor` is not sufficient by itself for the local Qwen3.5 JANG folders on this machine, because they need the multimodal load path
- `Qwen3.5-9B-JANG_4S` now serves successfully after:
  - upgrading to `vmlx 1.3.35`
  - installing `vmlx[vision]`
  - launching with `--is-mllm`
  - serving it as `model="local"` on the OpenAI-compatible API
- current `vmlx` MLLM continuous-batching is not stable for the local Qwen3.5 JANG VLMs on this machine; first-token prefill can fail inside `mllm_batch_generator` with `AttributeError: 'Qwen3_5Model' object has no attribute 'layers'`
- because of that, Atomic Chat should force multimodal JANG models onto the simpler `--is-mllm` runtime path and skip continuous batching, paged cache, KV quantization, and prefix-cache tuning for those sessions
- plain `vmlx doctor` still reports tensor-shape mismatches for the local Qwen3.5 JANG folders, so direct serve tests matter more than doctor alone for these multimodal models
- `Nemotron-Cascade-2-30B-A3B-JANG_4M` still fails the latest `vmlx doctor` inference check on this machine with unexpected extra parameters during load
- because of that, Atomic Chat can be wired for vMLX now, but each model should still be treated as provisional until it survives either:
  - `vmlx doctor <model-dir>` for text-only models, or
  - an actual `vmlx serve ...` smoke test for multimodal JANG models

Design rule:

- if a folder has `jang_config.json`, it should be routed to the VMLX/JANG path, not to bundled MLX or llama.cpp

Recommended integration model:

1. Add a new local provider for VMLX, separate from the built-in MLX plugin.
2. Add a configurable `model_root` setting with the default JANGQ-AI path above.
3. Discover models by scanning subfolders under `model_root` for `jang_config.json`.
4. Register discovered models in the provider UI without pre-loading them.
5. When a request targets one of these models, Atomic Chat should ensure the VMLX server is serving that exact folder.
6. If a different JANG model is already loaded, stop or unload the current server-managed model first.
7. Wait for VMLX readiness via health check plus `GET /v1/models` before forwarding chat traffic.
8. After the request completes, unload the model or stop the VMLX process instead of keeping it resident forever.

The important architecture constraint is this:

- current `vmlx` docs show one served local model per server process
- so Atomic Chat should manage model lifecycle explicitly
- do not assume vMLX can hot-swap arbitrary JANG folders inside one long-lived process without app coordination

That makes this path closer to the existing local engine plugins than to Ollama's always-on library model, even though the transport should still look like a localhost OpenAI-compatible provider.

Operational goals for VMLX/JANG:

- discover models from disk, not from a remote catalog
- load a model on demand for the active request
- use localhost OpenAI-compatible chat endpoints for inference
- unload after completion or after a short idle window
- keep the filesystem root configurable because the user may store JANG models on external volumes

Practical implementation consequence:

- provider settings need both `base_url` and `model_root`
- model discovery comes from filesystem scan first, not just `GET /v1/models`
- `GET /v1/models` is still useful as a readiness check after launch
- request handling must own process start, readiness wait, and teardown

Minimal effective vMLX runtime settings for text-only JANG models:

- `continuous batching`: on
- `paged KV cache`: on
- `KV cache quantization`: default to `q8`
- `prefix cache memory fraction`: keep modest on a `24 GB` Mac; `0.15` is a good default
- `prefix cache TTL`: short but nonzero; `10` minutes is reasonable
- `default thinking`: off unless the UI explicitly wants reasoning-mode output
- `JIT`: on

Important exception:

- if the selected JANG model is actually an MLLM/VLM model being used for text-only chat, prefer the simple MLLM runtime path and do not enable continuous batching or paged/KV-cache optimizations until `vmlx` fixes the current Qwen3.5 MLLM batching bug

Do not dump every `vmlx serve` flag into the UI.

For this app, the high-signal runtime knobs are:

- batching
- paged cache
- KV-cache quantization
- prompt/prefix cache budget
- prefix cache TTL
- thinking default
- JIT

Those settings are coupled enough that the provider page should expose helper presets instead of forcing users to tune them one by one.

Recommended preset shapes:

- `Balanced`: best default for local chat, with `q8` KV cache and a moderate cache budget
- `Memory Saver`: same general structure, but with `q4` KV cache and a smaller cache budget for larger models
- `Max Quality`: keep batching/paged cache/JIT, but disable KV quantization

Debugging checklist for VMLX/JANG:

- whether the configured `model_root` exists and is mounted
- whether the chosen model folder contains `jang_config.json`
- whether the app launched `vmlx serve` for the requested folder with `--served-model-name local`
- whether localhost health and `GET /v1/models` are reachable before chat starts
- whether the requested model is the currently served local model
- whether the app tears the process down after the request instead of leaking resident models
- whether the model directory contains macOS `._*` sidecar files; if it does, clean it with `dot_clean -m`
- whether `vmlx doctor <model-dir>` passes an inference test before wiring the model into the UI
- whether a Qwen3.5 JANG folder was launched with `--is-mllm` and the `vmlx[vision]` extra installed

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

There is another important variant of this problem:

- for localhost OpenAI-compatible providers like Ollama, browser/webview `fetch` is often more reliable than the Tauri HTTP plugin
- Tauri HTTP can connect, return `200`, and still leave the UI waiting forever on streamed output
- for that reason, local OpenAI-compatible chat and model-list requests should try browser/webview `fetch` first and only use Tauri HTTP as a timed fallback

This distinction matters because "local provider" does not always mean "use the same transport as llama.cpp / MLX".
Those runtimes have custom local bridges; Ollama is a separate local HTTP server and behaves better when treated that way.

### Thinking-model gotcha on Ollama

For some Ollama models, OpenAI-compatible streaming does not look like a normal text stream.

Example behavior seen with `qwen3:4b`:

- streamed chunks contained `delta.reasoning`
- chunks often had empty `delta.content`
- non-streaming requests could still return valid final `message.content`

Practical consequence:

- the server can be healthy
- the request can return `200`
- the UI can still look blank if the frontend assumes normal streamed `content`

Mitigations used here:

- expose an Ollama per-model `enable_thinking` setting
- map that to `reasoning_effort` in `web-app/src/lib/model-factory.ts`
- default Ollama models toward non-thinking chat behavior unless explicitly enabled
- keep a `reasoning` capability toggle in the model editor for models that genuinely surface reasoning in the UI

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
- whether a local OpenAI-compatible provider is using browser `fetch` or Tauri HTTP
- whether the model is streaming `reasoning` instead of normal `content`
- whether Ollama already logged a `200` for the request

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

### Problem: Ollama model appears in the server but not in the app

Check:

- whether the provider is active
- whether the base URL is exactly `http://127.0.0.1:11434/v1`
- whether the app allowed local provider registration without an API key
- whether `DataProvider` auto-imported models for the empty local provider
- whether `GET /v1/models` works from the app transport path, not just from terminal

### Problem: Ollama returns `200` but the UI never finishes

Check:

- whether the app is still using the stale packaged build instead of the latest bundle
- whether the local request is going through browser/webview `fetch` first
- whether the model is a thinking model streaming `delta.reasoning`
- whether disabling thinking for that model changes the behavior

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

For packaged app testing, remember one extra thing:

- rebuilding `web-app` alone is not enough for the already-open release app window
- if you are testing `src-tauri/target/release/bundle/macos/Atomic Chat.app`, you must rebuild the bundle and relaunch that app
- otherwise you can easily end up validating a stale packaged build while the source tree already contains the fix

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
