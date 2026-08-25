import { rmSync } from 'node:fs'
import { resolve } from 'node:path'

const issueOutputDirectory = new URL('../../out/shared/issues', import.meta.url)

export function cleanIssueSharedBuildOutput(directory = issueOutputDirectory) {
  rmSync(directory, { recursive: true, force: true })
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  cleanIssueSharedBuildOutput()
}
