import type {
  ArtifactShareListResult,
  ArtifactShareLookupResult,
  ArtifactShareShareResult,
  ArtifactShareStatusResult
} from '../../shared/self-hosted-artifacts/artifact-share-contract'
import type { CommandHandler, HandlerContext } from '../dispatch'
import { printResult } from '../format'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import { RuntimeClientError } from '../runtime-client'
import {
  resolveArtifactShareCliFileTarget,
  resolveArtifactShareCliHost,
  tokenFromArtifactShareLinkOrToken
} from './artifact-share-cli-target'
import { formatArtifactShareList, formatArtifactShareStatus } from './artifact-share-cli-format'

function stringFlag(ctx: HandlerContext, name: string): string | undefined {
  const value = ctx.flags.get(name)
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function reject(ctx: HandlerContext): void {
  rejectRemoteSelectionFlags(
    ctx.flags,
    'artifact commands; files are shared by the computer that holds them.'
  )
  if (ctx.flags.has('api-url')) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--api-url is not supported: files are shared over the local network by the computer that holds them.'
    )
  }
}

function fileTarget(ctx: HandlerContext) {
  return resolveArtifactShareCliFileTarget(process.env, ctx.cwd, stringFlag(ctx, 'file'))
}

export const ARTIFACT_SHARE_CLI_HANDLERS: Record<string, CommandHandler> = {
  'artifacts share': async (ctx) => {
    reject(ctx)
    const response = await ctx.client.call<ArtifactShareShareResult>(
      'artifactShare.share',
      fileTarget(ctx)
    )
    printResult(response, ctx.json, (result) =>
      result.workspaceCreated && result.file.workspace
        ? `${result.file.url ?? ''}\nStarted sharing ${result.file.workspace.rootPath}: anyone with a link can open files in it.`
        : (result.file.url ?? '')
    )
  },
  'artifacts update': async (ctx) => {
    reject(ctx)
    throw new RuntimeClientError(
      'invalid_argument',
      'Links read the file directly, so there is nothing to update. Save the file and reload the link.'
    )
  },
  'artifacts unshare': async (ctx) => {
    reject(ctx)
    const target = fileTarget(ctx)
    const lookup = await ctx.client.call<ArtifactShareLookupResult>('artifactShare.lookup', target)
    const workspace = lookup.result.file.workspace
    if (!workspace) {
      throw new RuntimeClientError(
        'invalid_argument',
        'The workspace containing this file is not shared.'
      )
    }
    const response = await ctx.client.call('artifactShare.stopWorkspace', {
      executionHostId: target.executionHostId,
      token: workspace.token
    })
    printResult(
      { ...response, result: { stopped: true, rootPath: workspace.rootPath } },
      ctx.json,
      () => `Stopped sharing ${workspace.rootPath}.`
    )
  },
  'artifacts list': async (ctx) => {
    reject(ctx)
    const response = await ctx.client.call<ArtifactShareListResult>('artifactShare.list', {})
    printResult(response, ctx.json, formatArtifactShareList)
  },
  'artifacts delete': async (ctx) => {
    reject(ctx)
    const raw = stringFlag(ctx, 'id')
    if (!raw) {
      throw new RuntimeClientError('invalid_argument', 'Missing required link or token.')
    }
    const token = tokenFromArtifactShareLinkOrToken(raw)
    const listing = await ctx.client.call<ArtifactShareListResult>('artifactShare.list', {})
    const matches = listing.result.hosts.filter((host) =>
      host.workspaces.some((workspace) => workspace.token === token)
    )
    if (matches.length !== 1) {
      throw new RuntimeClientError(
        'invalid_argument',
        matches.length === 0
          ? 'No shared workspace uses that link on a reachable computer.'
          : 'That token is shared on more than one computer; pass the full link.'
      )
    }
    const response = await ctx.client.call('artifactShare.stopWorkspace', {
      executionHostId: matches[0].host.executionHostId,
      token
    })
    printResult({ ...response, result: { stopped: true } }, ctx.json, () => 'Sharing stopped.')
  },
  'artifacts service status': async (ctx) => {
    reject(ctx)
    const response = await ctx.client.call<ArtifactShareStatusResult>('artifactShare.hostStatus', {
      executionHostId: resolveArtifactShareCliHost(process.env)
    })
    printResult(response, ctx.json, formatArtifactShareStatus)
  }
}
