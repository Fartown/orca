import { StyleSheet, Text, View } from 'react-native'
import type { LocalTaskSessionState } from '../../../src/shared/local-tasks/local-task-link-types'
import { AgentStateDot } from '../components/AgentStateDot'
import type { AgentDotState } from '../worktree/agent-row-display'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskRowSession } from './local-task-progress-projection'
import { localTaskStyles } from './local-tasks-styles'

/** A linked session's state as the app's agent dot draws it. */
export const LOCAL_TASK_SESSION_DOT: Record<LocalTaskSessionState, AgentDotState | 'unverifiable'> =
  {
    working: 'working',
    waiting: 'waiting',
    blocked: 'blocked',
    done: 'done',
    idle: 'idle',
    exited: 'interrupted',
    missing: 'unconfirmed',
    unknown: 'idle',
    unverifiable: 'unverifiable'
  }

// As many as the desktop row shows, the newest; the rest are counted.
const SHOWN = 3

/** A row's session dots (REQ-012), read aloud as their states. None for a task with no session. */
export function LocalTaskSessionDots(props: { sessions: readonly LocalTaskRowSession[] }) {
  if (props.sessions.length === 0) {
    return null
  }
  const states = localTasksCopy().work.sessionStates
  return (
    <View
      style={styles.dots}
      accessible
      accessibilityLabel={props.sessions.map((session) => states[session.state]).join(', ')}
    >
      {props.sessions.slice(-SHOWN).map((session) => (
        <AgentStateDot key={session.id} state={LOCAL_TASK_SESSION_DOT[session.state]} />
      ))}
      {props.sessions.length > SHOWN ? (
        <Text style={localTaskStyles.meta}>+{props.sessions.length - SHOWN}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 }
})
