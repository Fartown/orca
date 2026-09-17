import { basename, resolve } from 'node:path'
import type { RemoteArtifactInput } from '../shared/artifact-cli-bridge'

export type PreparedRemoteArtifactCliInput = {
  stdin?: string
  artifactInput?: RemoteArtifactInput
}

const BOOLEAN_FLAGS = new Set(['help', 'json'])
const VALUE_FLAGS = new Set(['api-url', 'environment', 'file', 'pairing-code'])

function parseArtifactInvocation(argv: string[]): { command: string; file?: string } | null {
  const positionals: string[] = []
  let file: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) {
      positionals.push(token)
      continue
    }
    const assignment = token.slice(2)
    const equalsIndex = assignment.indexOf('=')
    const flag = equalsIndex === -1 ? assignment : assignment.slice(0, equalsIndex)
    if (flag === 'file' && equalsIndex !== -1) {
      file = assignment.slice(equalsIndex + 1)
      continue
    }
    if (equalsIndex !== -1 || BOOLEAN_FLAGS.has(flag)) {
      continue
    }
    if (VALUE_FLAGS.has(flag) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      if (flag === 'file') {
        file = argv[index + 1]
      }
      index += 1
    }
  }
  if (positionals[0] !== 'artifacts' || !['share', 'update', 'unshare'].includes(positionals[1])) {
    return null
  }
  return { command: positionals[1], file: file ?? positionals[2] }
}

export async function prepareRemoteArtifactCliInput(
  argv: string[],
  cwd: string
): Promise<PreparedRemoteArtifactCliInput> {
  const invocation = parseArtifactInvocation(argv)
  if (!invocation || argv.includes('--help') || !invocation.file) {
    return {}
  }
  // Why only the path: the computer holding the file serves it, so the client never carries its bytes.
  const sourceKey = resolve(cwd, invocation.file)
  return { artifactInput: { sourceKey, fileName: basename(sourceKey) } }
}
