import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { writeJson } from '../signing-probe/probe-command.mjs'
import { startupDeadline } from './probe-startup.mjs'

async function digest(file, algorithm, encoding) {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
  }
  return hash.digest(encoding)
}

export async function createForkFeed({ zip, sha, tag, version, output }) {
  const bytes = statSync(zip).size
  const sha256 = await digest(zip, 'sha256', 'hex')
  const sha512 = await digest(zip, 'sha512', 'base64')
  const name = `orca-integration-macos-${process.arch}.zip`
  const assets = ['arm64', 'x64'].map((arch) => ({
    name: `orca-integration-macos-${arch}.zip`,
    bytes,
    sha256
  }))
  const manifest = {
    schemaVersion: 2,
    tag,
    sha,
    desktopVersion: version,
    androidVersion: '0.0.48',
    androidVersionCode: 211400000,
    assets
  }
  const catalog = [
    {
      draft: false,
      prerelease: true,
      tag_name: tag,
      assets: [...assets, { name: 'build-info.json' }, { name: 'latest-mac.yml' }]
    }
  ]
  const yaml = `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512}\n    size: ${bytes}\npath: ${name}\nsha512: ${sha512}\nreleaseDate: '${new Date().toISOString()}'\n`
  const requests = []
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture').pathname
    requests.push({ path, at: Date.now() })
    writeJson(output, requests)
    if (path.endsWith('.zip')) {
      response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': bytes })
      createReadStream(zip).pipe(response)
      return
    }
    const content =
      path === '/catalog'
        ? JSON.stringify(catalog)
        : path.endsWith('build-info.json')
          ? JSON.stringify(manifest)
          : path.endsWith('-mac.yml')
            ? yaml
            : null
    response.writeHead(content === null ? 404 : 200, {
      'Content-Type': path.endsWith('.yml') ? 'text/yaml' : 'application/json'
    })
    response.end(content ?? 'Unknown fixture request')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      writeJson(output, requests)
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  }
}

export async function routeForkRequests(app, fixture, tag) {
  return app.evaluate(
    ({ session }, { fixture, tag }) => {
      const root = `https://github.com/Fartown/orca/releases/download/${tag}/`
      globalThis.__orcaProbeRequests = []
      for (const target of [
        session.defaultSession,
        session.fromPartition('electron-updater', { cache: false })
      ]) {
        target.webRequest.onBeforeRequest(
          { urls: ['https://api.github.com/repos/Fartown/orca/releases*', `${root}*`] },
          (details, callback) => {
            globalThis.__orcaProbeRequests.push(details.url)
            const url = new URL(details.url)
            const path =
              url.hostname === 'api.github.com' ? 'catalog' : url.pathname.split('/').at(-1)
            callback({ redirectURL: `${fixture}/${path}${url.search}` })
          }
        )
      }
    },
    { fixture, tag }
  )
}

export async function verifyForkRouting(app, tag, output) {
  const observed = await startupDeadline(
    app.evaluate(async ({ net }) => {
      const response = await net.fetch(
        'https://api.github.com/repos/Fartown/orca/releases?per_page=30'
      )
      const catalog = await response.json()
      return {
        status: response.status,
        url: response.url,
        tags: Array.isArray(catalog) ? catalog.map((release) => release.tag_name) : null,
        routedRequests: globalThis.__orcaProbeRequests
      }
    }),
    'Default-session fork routing preflight',
    25_000
  )
  writeJson(join(output, 'fork-routing-preflight.json'), observed)
  if (observed.status !== 200 || observed.tags?.length !== 1 || observed.tags[0] !== tag) {
    throw new Error('Default fork routing did not reach this run fixture; no update attempted')
  }
}

export async function saveForkEvidence(app, page, output, phase) {
  const observed = await Promise.all([
    startupDeadline(
      app.evaluate(() => globalThis.__orcaProbeRequests),
      'Fork requests',
      3000
    ).catch((error) => ({ error: String(error) })),
    startupDeadline(
      page.evaluate(async () => ({
        current: await window.api.updater.getStatus(),
        events: window.__orcaProbeStatuses ?? []
      })),
      'Updater statuses',
      3000
    ).catch((error) => ({ error: String(error) }))
  ])
  writeJson(join(output, `fork-check-${phase}.json`), {
    routedRequests: observed[0],
    statuses: observed[1]
  })
}
