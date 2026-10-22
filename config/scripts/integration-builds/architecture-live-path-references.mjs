import { parse } from 'jsonc-parser'

// Absence bans and historical parity pins are not live inputs; their own architecture gate checks them.
export function architectureLivePathReferences(text) {
  const manifest = parse(text)
  return JSON.stringify({
    ...manifest,
    policies: manifest.policies.map((policy) => ({
      ...policy,
      rules: policy.rules.map((rule) =>
        rule.type === 'forbidden-path' || rule.type === 'reference-parity'
          ? { ...rule, paths: [] }
          : rule
      )
    }))
  })
}
