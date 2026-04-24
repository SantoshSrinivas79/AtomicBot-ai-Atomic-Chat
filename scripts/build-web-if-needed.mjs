import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const webRoot = path.join(repoRoot, 'web-app')
const webDistRoot = path.join(webRoot, 'dist')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  })

  if (result.status !== 0) {
    fail(`Command failed: ${command} ${args.join(' ')}`)
  }
}

function statMtimeMs(filePath) {
  return fs.statSync(filePath).mtimeMs
}

function latestMtime(targetPath, ignored = new Set()) {
  if (!fs.existsSync(targetPath)) {
    return 0
  }

  const stat = fs.statSync(targetPath)
  let latest = stat.mtimeMs

  if (!stat.isDirectory()) {
    return latest
  }

  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue
    }

    latest = Math.max(
      latest,
      latestMtime(path.join(targetPath, entry.name), ignored)
    )
  }

  return latest
}

const webInputs = [
  path.join(webRoot, 'src'),
  path.join(webRoot, 'public'),
  path.join(webRoot, 'index.html'),
  path.join(webRoot, 'vite.config.ts'),
  path.join(webRoot, 'package.json'),
  path.join(repoRoot, 'package.json'),
  path.join(repoRoot, 'yarn.lock'),
]

const ignoredDirs = new Set(['dist', 'node_modules', '.turbo'])
const latestInputMtime = webInputs.reduce((latest, inputPath) => {
  if (!fs.existsSync(inputPath)) {
    return latest
  }

  if (fs.statSync(inputPath).isDirectory()) {
    return Math.max(latest, latestMtime(inputPath, ignoredDirs))
  }

  return Math.max(latest, statMtimeMs(inputPath))
}, 0)

const distMtime = latestMtime(webDistRoot)
const needsBuild = !fs.existsSync(webDistRoot) || latestInputMtime > distMtime

if (!needsBuild) {
  console.log('Web dist is up to date, skipping rebuild.')
  process.exit(0)
}

console.log('Web dist is missing or stale, rebuilding...')
run('yarn', ['build:web'], repoRoot)
