/** Decoded bytes of a padded base64 string, without decoding it. */
export function base64DecodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor(base64.length / 4) * 3 - padding
}
