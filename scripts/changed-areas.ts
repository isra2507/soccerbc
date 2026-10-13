// Decides which parts of the project a change touches, so CI and deploys can skip the rest.
//
//   node scripts/changed-areas.ts <base-commit> <head-commit>
//
// prints `api=true`, `web=false`, ... lines (the format GitHub Actions reads from
// $GITHUB_OUTPUT). If the commits cannot be compared, every area is reported as changed:
// running too much is safe, skipping something is not.
import { execFileSync } from 'node:child_process'

export const AREAS = ['api', 'web', 'infra', 'tests', 'ci'] as const
export type Area = (typeof AREAS)[number]

// `dir/**` matches everything under dir; anything else must match the whole path.
// Anything that is not listed here (docs, README) triggers nothing.
const RULES: Record<Area, string[]> = {
  // Deployed: the Lambda bundle.
  api: ['api/**', 'shared/**', 'package.json', 'package-lock.json', 'tsconfig.json'],
  // Deployed: the static site.
  web: [
    'src/**',
    'public/**',
    'index.html',
    'vite.config.js',
    'shared/**',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
  ],
  infra: ['template.yml', 'samconfig.toml'],
  // Not deployed, but they decide whether the code still works.
  tests: [
    'test/**',
    'e2e/**',
    'playwright.config.ts',
    'scripts/**',
    'docker-compose.yml',
    '.oxlintrc.json',
  ],
  // A workflow change must be proven by running the pipelines.
  ci: ['.github/**'],
}

const matches = (file: string, pattern: string): boolean =>
  pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern

export function areasFor(files: readonly string[]): Record<Area, boolean> {
  return Object.fromEntries(
    AREAS.map((area) => [area, files.some((file) => RULES[area].some((rule) => matches(file, rule)))]),
  ) as Record<Area, boolean>
}

const everything = (): Record<Area, boolean> =>
  Object.fromEntries(AREAS.map((area) => [area, true])) as Record<Area, boolean>

export function changedFiles(base: string, head: string): string[] | null {
  // A new branch or a first push has no usable base.
  if (!base || /^0+$/.test(base)) {
    return null
  }

  try {
    return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter(Boolean)
  } catch {
    return null
  }
}

if (import.meta.main) {
  const [base = '', head = 'HEAD'] = process.argv.slice(2)
  const files = changedFiles(base, head)
  const areas = files ? areasFor(files) : everything()

  console.error(files ? `Changed files: ${files.length}` : 'Cannot compare commits: treating everything as changed')
  for (const area of AREAS) {
    console.log(`${area}=${areas[area]}`)
  }
}
