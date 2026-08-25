import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../../shared/native-chat-types'
import { buildRoundTranscriptFacts } from './round-record-transcript-facts'

function message(
  id: string,
  role: NativeChatMessage['role'],
  text: string,
  timestamp: number | null,
  turnId?: string
): NativeChatMessage {
  return {
    id,
    role,
    blocks: [{ type: 'text', text }],
    timestamp,
    source: 'transcript',
    ...(turnId ? { turnId } : {})
  }
}

describe('buildRoundTranscriptFacts', () => {
  it('groups explicit provider turns even when their messages are interleaved', () => {
    const facts = buildRoundTranscriptFacts([
      message('u-1', 'user', 'First prompt', 10, 'turn-1'),
      message('u-2', 'user', 'Second prompt', 20, 'turn-2'),
      message('a-1', 'assistant', 'First result', 30, 'turn-1'),
      message('a-2', 'assistant', 'Second result', 40, 'turn-2')
    ])

    expect(facts).toEqual([
      {
        factKey: 'provider-turn:turn-1',
        providerTurnId: 'turn-1',
        occurredAt: 10,
        finalizedAt: 30,
        userInput: 'First prompt',
        agentOutput: 'First result'
      },
      {
        factKey: 'provider-turn:turn-2',
        providerTurnId: 'turn-2',
        occurredAt: 20,
        finalizedAt: 40,
        userInput: 'Second prompt',
        agentOutput: 'Second result'
      }
    ])
  })

  it('builds stable weak facts from user-to-assistant boundaries without guessing a turn id', () => {
    const messages = [
      message('u-1', 'user', 'First prompt', 10),
      message('a-1', 'assistant', 'First part', 20),
      message('a-2', 'assistant', 'Second part', 30),
      message('u-2', 'user', 'Second prompt', 40),
      message('tool-1', 'tool', 'Tool output', 45),
      message('a-3', 'assistant', 'Second result', 50)
    ]

    const first = buildRoundTranscriptFacts(messages)
    const replay = buildRoundTranscriptFacts(messages)

    expect(replay).toEqual(first)
    expect(first).toHaveLength(2)
    expect(first[0]).toMatchObject({
      occurredAt: 10,
      finalizedAt: 30,
      userInput: 'First prompt',
      agentOutput: 'First part\n\nSecond part'
    })
    expect(first[0]?.providerTurnId).toBeUndefined()
    expect(first[0]?.factKey).toMatch(/^messages:[a-f0-9]{64}$/)
    expect(first[1]).toMatchObject({
      occurredAt: 40,
      finalizedAt: 50,
      userInput: 'Second prompt',
      agentOutput: 'Second result'
    })
  })

  it('drops transcript segments that never produced assistant output', () => {
    expect(
      buildRoundTranscriptFacts([
        message('u-1', 'user', 'Unanswered', 10),
        message('reasoning-1', 'reasoning', 'Thinking', 20)
      ])
    ).toEqual([])
  })
})
