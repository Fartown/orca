export function continuedStreamPosition(
  streamPosition: number | undefined,
  currentSequence: number,
  providerOffset: number
): { position: number; offset: number } | null {
  if (streamPosition === undefined || !Number.isSafeInteger(streamPosition) || streamPosition < 0) {
    return null
  }
  const offset = Math.max(providerOffset, currentSequence - streamPosition)
  return { position: offset + streamPosition, offset }
}
