import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { AREAS, areasFor, type Area } from '../scripts/changed-areas.ts'

const only = (...areas: Area[]) =>
  Object.fromEntries(AREAS.map((area) => [area, areas.includes(area)]))

describe('which parts a change touches', () => {
  test('a frontend-only change does not touch the API', () => {
    for (const file of ['src/pages/StaffPage.tsx', 'src/App.css', 'public/bc-logo.webp', 'index.html']) {
      assert.deepEqual(areasFor([file]), only('web'), file)
    }
  })

  test('a backend-only change does not touch the frontend', () => {
    for (const file of ['api/handler.ts', 'api/rules/balance.ts', 'api/store/dynamo.ts']) {
      assert.deepEqual(areasFor([file]), only('api'), file)
    }
  })

  test('shared code and dependencies touch both, because both are built from them', () => {
    for (const file of ['shared/constants.ts', 'shared/schemas.ts', 'package.json', 'package-lock.json', 'tsconfig.json']) {
      assert.deepEqual(areasFor([file]), only('api', 'web'), file)
    }
  })

  test('infrastructure, tests and workflows are their own areas, and deploy nothing', () => {
    assert.deepEqual(areasFor(['template.yml']), only('infra'))
    assert.deepEqual(areasFor(['samconfig.toml']), only('infra'))
    assert.deepEqual(areasFor(['test/api.test.ts']), only('tests'))
    assert.deepEqual(areasFor(['e2e/board.spec.ts']), only('tests'))
    assert.deepEqual(areasFor(['scripts/dev-api.ts']), only('tests'))
    assert.deepEqual(areasFor(['.oxlintrc.json']), only('tests'))
    assert.deepEqual(areasFor(['.github/workflows/deploy.yml']), only('ci'))
  })

  test('documentation changes touch nothing', () => {
    assert.deepEqual(areasFor(['README.md', 'DEPLOYMENT.md', 'docs/api.md', 'docs/architecture.md']), only())
    assert.deepEqual(areasFor([]), only())
  })

  test('a mixed change reports every area it touches', () => {
    assert.deepEqual(areasFor(['src/lib/board.ts', 'api/handler.ts', 'README.md']), only('api', 'web'))
    assert.deepEqual(areasFor(['src/App.tsx', 'template.yml']), only('web', 'infra'))
  })

  test('matches whole directories and exact names, not look-alike prefixes', () => {
    assert.deepEqual(areasFor(['api-notes.md']), only())
    assert.deepEqual(areasFor(['srcs/readme.txt']), only())
    assert.deepEqual(areasFor(['docs/src/diagram.png']), only())
    assert.deepEqual(areasFor(['package.json.bak']), only())
  })
})
