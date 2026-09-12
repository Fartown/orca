import path from 'node:path'
import { assertPublisherRequirement } from '../mac-signature-requirement.cjs'

export const CASES = ['same-certificate', 'wrong-certificate', 'tampered']

export function probeOptions(args, cwd = process.cwd()) {
  const options = { output: null, cases: CASES, validateOnly: false }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--validate-only') {
      options.validateOnly = true
    } else if (argument === '--output') {
      const value = args[++index]
      if (!value || value.startsWith('--')) {
        throw new Error('--output needs a directory')
      }
      options.output = path.resolve(cwd, value)
    } else if (argument === '--case') {
      const value = args[++index]
      if (!CASES.includes(value)) {
        throw new Error(`Unknown probe case: ${value}`)
      }
      options.cases = [value]
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  if (!options.validateOnly && !options.output) {
    throw new Error('--output is required')
  }
  if (options.output && [path.parse(cwd).root, cwd].includes(options.output)) {
    throw new Error('Use a dedicated output directory, not a filesystem or workspace root')
  }
  return options
}

export function assertHostedMac(env = process.env, platform = process.platform) {
  if (
    platform !== 'darwin' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    !env.RUNNER_TEMP
  ) {
    throw new Error('Trust-changing probes run only on ephemeral GitHub-hosted macOS runners')
  }
}

export function assertIsolatedMac(
  output,
  env = process.env,
  platform = process.platform,
  cwd = process.cwd()
) {
  const root =
    env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted'
      ? env.RUNNER_TEMP
      : path.join(cwd, '.docs', 'integration-updates-ui-validation', '2026-09-12', 'selfsigned-ci')
  if (
    platform !== 'darwin' ||
    !root ||
    !path.resolve(output).startsWith(`${path.resolve(root)}${path.sep}`)
  ) {
    throw new Error('PEM-only macOS probes require a dedicated isolated evidence directory')
  }
}

export function assertPinnedRequirement(requirement, fingerprint) {
  return assertPublisherRequirement(requirement, fingerprint)
}
