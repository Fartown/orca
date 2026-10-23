import { basename, dirname, resolve } from 'node:path'
import { getServeUpdateHandoffPath } from '../../shared/serve-update-handoff'
import { isSameUserDataPath } from '../../shared/serve-user-data-path'

export function resolveServeUpdateHandoffPath(
  configuredPath: string | undefined,
  userDataPath: string
): string | null {
  if (!configuredPath) {
    return null
  }
  const candidate = resolve(configuredPath)
  const expected = getServeUpdateHandoffPath(userDataPath)
  return basename(candidate) === basename(expected) &&
    isSameUserDataPath(dirname(candidate), userDataPath)
    ? expected
    : null
}
