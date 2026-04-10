# Atomic Chat User Guide

This guide is for someone who wants to use Atomic Chat as an application, not work on the codebase.

## What Atomic Chat does

Atomic Chat is a desktop AI chat app. You can:

- run local models with `llama.cpp`, MLX, or other bundled backends
- connect cloud providers
- chat with downloaded or imported models through a desktop UI

## Fastest way to start

If Atomic Chat is already installed in `/Applications`, run:

```bash
./start.sh
```

If you already built the app from this repo, `./start.sh` will prefer the local built app bundle.

If you want Atomic Chat to reuse Jan's llama.cpp models first, run:

```bash
./start.sh --prefer-jan-models
```

## If you do not have the app yet

### Option 1: Use an installed app

Install Atomic Chat normally, then run:

```bash
./start.sh
```

### Option 2: Build it from this repo

From the repo root:

```bash
yarn install
./start.sh --build
```

On this repo, the main macOS app bundle is typically created at:

```text
src-tauri/target/release/bundle/macos/Atomic Chat.app
```

## First run

When the app opens:

1. Pick or download a model from the Hub, or import your own local model.
2. Wait for the model to finish downloading or importing.
3. Select the model in the chat UI.
4. Start chatting.

## Importing your own local model

If you already have a local GGUF model:

1. Open Atomic Chat.
2. Use the model import flow in the UI.
3. Point it at the model folder or `.gguf` file.
4. If the model needs an `mmproj` file, import that as well.

## Sharing models with Jan

Atomic Chat can reuse Jan's llama.cpp models so you do not have to download the same GGUF files twice.

Run Atomic Chat with:

```bash
./start.sh --prefer-jan-models
```

If Jan uses a non-default data location, pass it explicitly:

```bash
./start.sh --prefer-jan-models --jan-data-folder "/Users/you/Library/Application Support/Jan/data"
```

How it works:

- Atomic Chat looks in Jan's llama.cpp model folder first.
- If a model is not present there, Atomic Chat falls back to its own local llama.cpp models.
- Jan-managed models are shared, read-only models inside Atomic Chat.

Default Jan model location on macOS:

```text
~/Library/Application Support/Jan/data/llamacpp/models
```

Important:

- Shared Jan models usually appear with their full model id, for example `unsloth/gemma-4-E4B-it-Q6_K`.
- If you search only for the short tail like `gemma-4-E4B-it-Q6_K`, you may miss the model in the picker.

## Local data location

Atomic Chat stores user data here on macOS:

```text
~/Library/Application Support/Atomic Chat/data
```

Useful subfolders:

- `llamacpp/models/` for downloaded or imported llama.cpp models
- `logs/` for application logs
- `llamacpp/backends/` for local llama.cpp runtime backends
- `extensions/` for installed extension bundles

## Logs and troubleshooting

Main app log:

```text
~/Library/Application Support/Atomic Chat/data/logs/app.log
```

If `./start.sh` says no app was found:

- install Atomic Chat into `/Applications`, or
- build the app with `yarn build:tauri:darwin:native`

If the app opens but a model does not run:

- confirm the model files exist under the Atomic Chat data folder
- check `app.log`
- make sure the required backend was bundled or downloaded

If a Jan model is missing from the model picker:

- relaunch with `./start.sh --prefer-jan-models`
- search for the full model id, such as `unsloth/gemma-4-E4B-it-Q6_K`
- if you just changed the app code, rebuild and relaunch with `./start.sh --build --prefer-jan-models`
- check `~/Library/Application Support/Atomic Chat/data/logs/app.log`

## How `start.sh` behaves

The launcher checks these locations in order:

1. local release app bundle from this repo
2. local universal app bundle from this repo
3. local debug app bundle from this repo
4. installed app at `/Applications/Atomic Chat.app`

That lets you use the same command whether you are testing a locally built app or running an installed one.
