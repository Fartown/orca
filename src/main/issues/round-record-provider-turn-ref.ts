import { createHash } from 'node:crypto'

function encodeFields(fields: readonly string[]): Buffer {
  const chunks: Buffer[] = []
  for (const field of fields) {
    const value = Buffer.from(field, 'utf8')
    const length = Buffer.allocUnsafe(4)
    length.writeUInt32BE(value.length)
    chunks.push(length, value)
  }
  return Buffer.concat(chunks)
}

export function createProviderTurnRefValue(
  identityFingerprint: string,
  providerTurnId: string
): string {
  return `v1:${createHash('sha256')
    .update(
      encodeFields([
        'orca-round-provider-turn-v1',
        identityFingerprint.trim(),
        providerTurnId.trim()
      ])
    )
    .digest('hex')}`
}
