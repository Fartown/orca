import type { DaemonEvent, DataEvent, DataGapEvent } from '../daemon/protocol/daemon-stream-events'

type StreamPosition = {
  receivedChars: number
  position?: number
  lastAbsoluteAt?: number
  incarnationId?: string
}

type StreamObservation = { state: StreamPosition; receivedChars: number }

function validPosition(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0
}

export class DaemonStreamPosition {
  private readonly sessions = new Map<string, StreamPosition>()

  private session(id: string): StreamPosition {
    let state = this.sessions.get(id)
    if (!state) {
      state = { receivedChars: 0 }
      this.sessions.set(id, state)
    }
    return state
  }

  beginAttach(id: string): StreamObservation {
    const state = this.session(id)
    return { state, receivedChars: state.receivedChars }
  }

  /** Count every stream event that advances the delivered position; other events pass through. */
  observe(event: DaemonEvent): void {
    if (event.event === 'data') {
      this.recordData(event.sessionId, event.payload)
    } else if (event.event === 'dataGap') {
      this.recordGap(event.sessionId, event.payload)
    }
  }

  recordData(id: string, payload: DataEvent['payload']): void {
    this.record(id, payload.rawLength ?? payload.sequenceChars ?? payload.data.length, payload.seq)
  }

  recordGap(id: string, payload: DataGapEvent['payload']): void {
    this.record(id, payload.sequenceChars ?? payload.droppedChars)
  }

  record(id: string, rawLength: number, seq?: number): void {
    const state = this.session(id)
    state.receivedChars += rawLength
    if (validPosition(seq)) {
      state.position = seq
      state.lastAbsoluteAt = state.receivedChars
    } else if (state.position !== undefined) {
      state.position += rawLength
    }
  }

  attach(
    id: string,
    baseline: number | undefined,
    isNew: boolean,
    observation: StreamObservation,
    incarnationId?: string
  ): void {
    if (!validPosition(baseline)) {
      return
    }
    const state = this.session(id)
    const receivedBefore = state === observation.state ? observation.receivedChars : 0
    const replacement =
      state.incarnationId !== undefined &&
      incarnationId !== undefined &&
      state.incarnationId !== incarnationId
    if (isNew || replacement || state.position === undefined) {
      // A fresh stream attaches after the synchronous owner snapshot; its early bytes follow that cut.
      if (state.lastAbsoluteAt === undefined || state.lastAbsoluteAt <= receivedBefore) {
        state.position = baseline + state.receivedChars - receivedBefore
      }
    }
    state.incarnationId = incarnationId
  }

  position(id: string): number | undefined {
    return this.sessions.get(id)?.position
  }

  forget(id: string): void {
    this.sessions.delete(id)
  }

  disconnected(): void {
    this.sessions.clear()
  }
}
