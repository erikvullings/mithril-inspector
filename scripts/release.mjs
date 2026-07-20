#!/usr/bin/env node
// Cuts a synchronized release across the publishable packages: bumps their
// version in lockstep, runs the same checks CI runs, commits, tags, then
// publishes each package with pnpm (which rewrites workspace:* ranges to the
// real version). npm/pnpm will prompt for a 2FA one-time password per package
// when the terminal is interactive — that's expected, just type the code.

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

// Dependency order: protocol first (no internal deps), then the other
// bundler-neutral core packages (order among them doesn't matter — they only
// depend on protocol), then adapter-kit (depends on all of those), then the
// build-tool adapters last (each depends on adapter-kit + the core packages;
// order between vite/rollup doesn't matter).
const PACKAGES = [
  "protocol",
  "runtime",
  "transform",
  "server",
  "overlay",
  "adapter-kit",
  "vite",
  "rollup",
  "esbuild",
  "webpack",
]

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/

function parseVersion(version) {
  const match = version.match(VERSION_RE)
  if (!match) throw new Error(`Not a valid semver version: "${version}"`)
  const [, major, minor, patch, prerelease] = match
  return { major: Number(major), minor: Number(minor), patch: Number(patch), prerelease }
}

function bump(currentVersion, releaseType) {
  if (VERSION_RE.test(releaseType)) return releaseType
  const { major, minor, patch, prerelease } = parseVersion(currentVersion)
  switch (releaseType) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "patch":
      // Matches `npm version patch` / `semver.inc` behavior: a prerelease at
      // the same patch number just drops the prerelease tag.
      return prerelease ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Unknown release type "${releaseType}" — use patch, minor, major, or an explicit version`)
  }
}

function pkgJsonPath(name) {
  return path.join(ROOT, "packages", name, "package.json")
}

function readPkgJson(name) {
  return JSON.parse(readFileSync(pkgJsonPath(name), "utf8"))
}

function writeVersion(name, version) {
  const file = pkgJsonPath(name)
  const raw = readFileSync(file, "utf8")
  const pkg = JSON.parse(raw)
  pkg.version = version
  const trailingNewline = raw.endsWith("\n")
  writeFileSync(file, JSON.stringify(pkg, null, 2) + (trailingNewline ? "\n" : ""))
}

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`)
  execFileSync(command, args, { stdio: "inherit", cwd: ROOT })
}

function gitStatusPorcelain() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: ROOT }).toString()
}

function main() {
  const [releaseTypeArg, ...rest] = process.argv.slice(2)
  const dryRun = rest.includes("--dry-run")

  if (!releaseTypeArg) {
    console.error("Usage: pnpm release <patch|minor|major|<version>> [--dry-run]")
    process.exit(1)
  }

  if (!dryRun && gitStatusPorcelain().trim()) {
    console.error("Working tree has uncommitted changes. Commit or stash them before releasing.")
    process.exit(1)
  }

  const versions = new Set(PACKAGES.map((name) => readPkgJson(name).version))
  if (versions.size !== 1) {
    console.error(`Package versions are out of sync: ${[...versions].join(", ")}`)
    console.error("Align them manually before running a release.")
    process.exit(1)
  }
  const currentVersion = [...versions][0]
  const nextVersion = bump(currentVersion, releaseTypeArg)
  const names = PACKAGES.map((name) => `@mithril-inspector/${name}`)

  console.log(`Releasing ${currentVersion} -> ${nextVersion}${dryRun ? " (dry run)" : ""}`)
  console.log(`Packages: ${names.join(", ")}`)

  if (dryRun) return

  for (const name of PACKAGES) writeVersion(name, nextVersion)

  // Refresh the lockfile so it reflects the new workspace versions.
  run("pnpm", ["install", "--lockfile-only"])

  // Same gate CI runs (build, typecheck, test — the root `test` script
  // already covers tests/browser, see tests/browser/README.md).
  run("pnpm", ["-r", "build"])
  run("pnpm", ["-r", "typecheck"])
  run("pnpm", ["-r", "test"])

  run("git", ["add", "pnpm-lock.yaml", ...PACKAGES.map((name) => `packages/${name}/package.json`)])
  const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: ROOT }).toString().trim()
  if (staged) {
    run("git", ["commit", "-m", `chore(release): v${nextVersion}`])
  } else {
    // First publish at an already-committed version: nothing to bump.
    console.log(`\nNo version change to commit — already at v${nextVersion}.`)
  }

  const existingTag = execFileSync("git", ["tag", "-l", `v${nextVersion}`], { cwd: ROOT }).toString().trim()
  if (!existingTag) {
    run("git", ["tag", "-a", `v${nextVersion}`, "-m", `v${nextVersion}`])
  } else {
    console.log(`Tag v${nextVersion} already exists, skipping.`)
  }

  console.log(`\nPublishing ${PACKAGES.length} packages — npm may prompt for a 2FA one-time password for each.`)
  for (const name of PACKAGES) {
    run("pnpm", ["--filter", `@mithril-inspector/${name}`, "publish", "--access", "public"])
  }

  console.log(`\nDone. Review the commit and tag, then push:\n  git push && git push origin v${nextVersion}`)
}

main()
