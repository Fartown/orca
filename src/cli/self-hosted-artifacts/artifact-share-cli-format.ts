import type {
  ArtifactShareCommentsResult,
  ArtifactShareDeleteCommentsResult
} from '../../shared/self-hosted-artifacts/artifact-share-comments-contract'
import type {
  ArtifactShareListResult,
  ArtifactShareServiceStatus,
  ArtifactShareStatusResult
} from '../../shared/self-hosted-artifacts/artifact-share-contract'

export function describeArtifactShareService(status: ArtifactShareServiceStatus): string {
  switch (status.state) {
    case 'serving':
      return `serving on ${status.ip}:${status.port}`
    case 'sharing-off':
      return 'sharing is off'
    case 'orca-not-running':
      return "Orca isn't open"
    case 'port-conflict':
      return `port ${status.port} is used by another program`
    case 'failed':
      return `failed: ${status.reason}`
    case 'unverifiable':
      return status.reason === 'host-outdated' ? 'Orca there needs an update' : 'not connected'
  }
}

export function formatArtifactShareStatus(result: ArtifactShareStatusResult): string {
  return `${result.host.label}: ${describeArtifactShareService(result.service)}`
}

export function formatArtifactShareList(result: ArtifactShareListResult): string {
  return result.hosts
    .map((host) => {
      const header = `${host.host.label} (${describeArtifactShareService(host.service)})`
      if (host.workspaces.length === 0) {
        return `${header}\n  No shared workspaces.`
      }
      const workspaces = host.workspaces.map((workspace) => {
        const files = workspace.linkedFiles.map(
          (file) => `    ${file.relativePath}${file.url ? `\n      ${file.url}` : ''}`
        )
        return [
          `  ${workspace.label}  ${workspace.rootPath}`,
          `    token: ${workspace.token}`,
          ...files
        ].join('\n')
      })
      return [header, ...workspaces].join('\n')
    })
    .join('\n\n')
}

function lineLabel(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`
}

/** One block per comment: id first so it can be passed straight to `comments delete`. */
export function formatArtifactShareComments(result: ArtifactShareCommentsResult): string {
  if (result.comments.length === 0) {
    return `No comments on this file on ${result.host.label}.`
  }
  return result.comments
    .map((comment) =>
      [
        `${comment.id}  ${comment.author ?? '(anonymous)'}  ${comment.createdAt}  ${lineLabel(comment.startLine, comment.endLine)}`,
        ...(comment.quote ? [`  > ${comment.quote}`] : []),
        ...comment.body.split('\n').map((line) => `  ${line}`)
      ].join('\n')
    )
    .join('\n\n')
}

export function formatArtifactShareDeletedComments(
  result: ArtifactShareDeleteCommentsResult
): string {
  const notes =
    result.removedNotes > 0 ? `, and ${result.removedNotes} review note(s) they became` : ''
  return `Deleted ${result.deletedComments} comment(s) on ${result.host.label}${notes}.`
}
