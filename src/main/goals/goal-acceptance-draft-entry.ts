import { runAcceptanceDraftFile } from './goal-acceptance-draft-runner'

void runAcceptanceDraftFile(process.argv[2]).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
