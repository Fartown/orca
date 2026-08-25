import { createHash } from 'node:crypto'
import type { NativeChatMessage } from '../../shared/native-chat-types'

export type RoundTranscriptFact = {
  factKey: string
  providerTurnId?: string
  occurredAt: number
  finalizedAt: number | null
  userInput?: string
  agentOutput: string
}

type MutableFact = {
  providerTurnId?: string
  messageIds: string[]
  occurredAt: number | null
  finalizedAt: number | null
  userInputs: string[]
  agentOutputs: string[]
}

export function buildRoundTranscriptFacts(
  messages: readonly NativeChatMessage[]
): RoundTranscriptFact[] {
  const facts: MutableFact[] = []
  const strongFacts = new Map<string, MutableFact>()
  let weakFact: MutableFact | null = null

  for (const message of messages) {
    if (message.turnId) {
      weakFact = null
      const fact = strongFacts.get(message.turnId) ?? createMutableFact(message.turnId)
      if (!strongFacts.has(message.turnId)) {
        strongFacts.set(message.turnId, fact)
        facts.push(fact)
      }
      appendMessage(fact, message)
      continue
    }
    if (message.role === 'user') {
      weakFact = createMutableFact()
      facts.push(weakFact)
      appendMessage(weakFact, message)
      continue
    }
    if (message.role === 'assistant') {
      weakFact ??= createMutableFact()
      if (!facts.includes(weakFact)) {
        facts.push(weakFact)
      }
      appendMessage(weakFact, message)
    }
  }

  return facts.flatMap(finalizeFact)
}

function createMutableFact(providerTurnId?: string): MutableFact {
  return {
    providerTurnId,
    messageIds: [],
    occurredAt: null,
    finalizedAt: null,
    userInputs: [],
    agentOutputs: []
  }
}

function appendMessage(fact: MutableFact, message: NativeChatMessage): void {
  const text = message.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n\n')
  if (!text) {
    return
  }
  fact.messageIds.push(message.id)
  if (message.timestamp !== null) {
    fact.occurredAt =
      fact.occurredAt === null ? message.timestamp : Math.min(fact.occurredAt, message.timestamp)
  }
  if (message.role === 'user') {
    fact.userInputs.push(text)
  } else if (message.role === 'assistant') {
    fact.agentOutputs.push(text)
    if (message.timestamp !== null) {
      fact.finalizedAt =
        fact.finalizedAt === null
          ? message.timestamp
          : Math.max(fact.finalizedAt, message.timestamp)
    }
  }
}

function finalizeFact(fact: MutableFact): RoundTranscriptFact[] {
  if (fact.agentOutputs.length === 0) {
    return []
  }
  const factKey = fact.providerTurnId
    ? `provider-turn:${fact.providerTurnId}`
    : `messages:${createHash('sha256').update(JSON.stringify(fact.messageIds)).digest('hex')}`
  return [
    {
      factKey,
      ...(fact.providerTurnId ? { providerTurnId: fact.providerTurnId } : {}),
      occurredAt: fact.occurredAt ?? fact.finalizedAt ?? 0,
      finalizedAt: fact.finalizedAt,
      ...(fact.userInputs.length > 0 ? { userInput: fact.userInputs.join('\n\n') } : {}),
      agentOutput: fact.agentOutputs.join('\n\n')
    }
  ]
}
