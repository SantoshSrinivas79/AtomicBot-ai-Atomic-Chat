import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const coreRoot = path.join(repoRoot, 'core')
const extensionsRoot = path.join(repoRoot, 'extensions')
const preInstallRoot = path.join(repoRoot, 'pre-install')

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
    if (ignored.has(entry.name) || entry.name.endsWith('.tgz')) {
      continue
    }

    latest = Math.max(
      latest,
      latestMtime(path.join(targetPath, entry.name), ignored)
    )
  }

  return latest
}

function normalizedPackName(name) {
  return name.replace('@', '').replace(/\//g, '-')
}

function extensionDirs() {
  return fs
    .readdirSync(extensionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('-extension'))
    .map((entry) => path.join(extensionsRoot, entry.name))
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function installStatePath() {
  const candidates = [
    path.join(extensionsRoot, '.yarn', 'install-state.gz'),
    path.join(extensionsRoot, 'node_modules', '.yarn-state.yml'),
  ]

  return candidates.find((candidate) => fs.existsSync(candidate))
}

function expectedTarballPath(pkg) {
  return path.join(
    preInstallRoot,
    `${normalizedPackName(pkg.name)}-${pkg.version}.tgz`
  )
}

function removeObsoleteTarballs(expectedTarballs) {
  if (!fs.existsSync(preInstallRoot)) {
    return false
  }

  let removedAny = false
  for (const entry of fs.readdirSync(preInstallRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.tgz')) {
      continue
    }

    const tarballPath = path.join(preInstallRoot, entry.name)
    if (!expectedTarballs.has(tarballPath)) {
      fs.rmSync(tarballPath, { force: true })
      console.log(`Removed obsolete bundled extension: ${entry.name}`)
      removedAny = true
    }
  }

  return removedAny
}

const corePackagePath = path.join(coreRoot, 'package.tgz')
const coreInputMtime = latestMtime(coreRoot, new Set(['dist', 'node_modules']))
const coreNeedsBuild =
  !fs.existsSync(corePackagePath) || coreInputMtime > statMtimeMs(corePackagePath)

const installState = installStatePath()
const installInputs = [
  path.join(extensionsRoot, 'package.json'),
  path.join(extensionsRoot, 'yarn.lock'),
  ...extensionDirs().map((dirPath) => path.join(dirPath, 'package.json')),
]
const installInputMtime = installInputs.reduce((latest, filePath) => {
  if (!fs.existsSync(filePath)) {
    return latest
  }

  return Math.max(latest, statMtimeMs(filePath))
}, 0)

let installNeedsRefresh =
  !installState || installInputMtime > statMtimeMs(installState)

if (coreNeedsBuild) {
  installNeedsRefresh = true
}

const extensions = extensionDirs().map((dirPath) => {
  const pkg = readJson(path.join(dirPath, 'package.json'))
  const tarballPath = expectedTarballPath(pkg)
  const inputMtime = latestMtime(dirPath, new Set(['dist', 'node_modules']))
  const needsBuild =
    coreNeedsBuild ||
    !fs.existsSync(tarballPath) ||
    inputMtime > statMtimeMs(tarballPath)

  return {
    pkg,
    tarballPath,
    needsBuild,
  }
})

const expectedTarballs = new Set(
  extensions.map((extension) => extension.tarballPath)
)
const removedObsoleteTarballs = removeObsoleteTarballs(expectedTarballs)
const staleExtensions = extensions.filter((extension) => extension.needsBuild)

if (
  !coreNeedsBuild &&
  !installNeedsRefresh &&
  !removedObsoleteTarballs &&
  staleExtensions.length === 0
) {
  console.log('Bundled extensions are up to date, skipping rebuild.')
  process.exit(0)
}

if (coreNeedsBuild) {
  console.log('Core package is stale, rebuilding core bundle...')
  run('yarn', ['build:core'], repoRoot)
}

if (installNeedsRefresh) {
  console.log('Extension workspace install state is stale, refreshing dependencies...')
  run('yarn', ['install'], extensionsRoot)
}

if (staleExtensions.length === 0) {
  console.log('No extension tarballs need to be rebuilt.')
  process.exit(0)
}

console.log(
  `Rebuilding ${staleExtensions.length} bundled extension(s): ${staleExtensions.map((extension) => extension.pkg.name).join(', ')}`
)

for (const extension of staleExtensions) {
  run('yarn', ['workspace', extension.pkg.name, 'build:publish'], extensionsRoot)
}
