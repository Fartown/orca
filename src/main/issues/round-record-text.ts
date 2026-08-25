import { ROUND_TEXT_PREVIEW_MAX_BYTES } from '../../shared/issues/constants'
import type {
  RoundRecord,
  RoundRecordStateSource,
  RoundTextPreview
} from '../../shared/issues/types'
import { clampUtf8TextPrefix, getUtf8ByteLength } from '../../shared/utf8-byte-limits'
import type { CreateRoundRecordInput, RoundTextInput } from './issue-repository-types'

export type NormalizedRoundRecordInput = {
  stateSource: RoundRecord['stateSource']
  userInput: RoundTextPreview
  agentOutput: RoundTextPreview
  pendingQuestion: RoundTextPreview
}

export function normalizeRoundRecordInput(
  input: CreateRoundRecordInput
): NormalizedRoundRecordInput {
  return {
    stateSource: input.stateSource,
    userInput: normalizeRoundTextPreview(input.userInput, input.stateSource),
    agentOutput: normalizeRoundTextPreview(input.agentOutput, input.stateSource),
    pendingQuestion: normalizeRoundTextPreview(input.pendingQuestion, input.stateSource)
  }
}

export function roundPreviewsEqual(left: RoundTextPreview, right: RoundTextPreview): boolean {
  return left.text === right.text && left.completeness === right.completeness
}

export function normalizeRoundTextPreview(
  input: RoundTextInput | undefined,
  source: RoundRecordStateSource
): RoundTextPreview {
  const text = input?.text?.trim() || null
  if (text === null) {
    return { text: null, completeness: 'not-captured' }
  }
  return {
    text: clampUtf8TextPrefix(text, ROUND_TEXT_PREVIEW_MAX_BYTES),
    completeness: source === 'hook' ? 'runtime-preview' : 'reconciled-preview'
  }
}

export function preferStrongerRoundPreview(
  current: RoundTextPreview,
  incoming: RoundTextPreview
): RoundTextPreview {
  const currentRank = completenessRank(current.completeness)
  const incomingRank = completenessRank(incoming.completeness)
  if (incomingRank > currentRank) {
    return incoming
  }
  if (incomingRank < currentRank) {
    return current
  }
  return getUtf8ByteLength(incoming.text ?? '') > getUtf8ByteLength(current.text ?? '')
    ? incoming
    : current
}

function completenessRank(value: RoundTextPreview['completeness']): number {
  switch (value) {
    case 'not-captured':
      return 0
    case 'runtime-preview':
      return 1
    case 'reconciled-preview':
      return 2
  }
}
