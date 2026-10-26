import { StyleSheet, Text, View } from 'react-native'
import { Circle, CircleCheck, CircleDashed, CircleDot, CircleX } from 'lucide-react-native'
import type {
  LocalTaskPriority,
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'
import { colors } from '../theme/mobile-theme'

// Why tokens only: the stored color is a name precisely so data cannot bypass the palette.
export const LOCAL_TASK_STATUS_COLOR_VALUES: Record<LocalTaskStatusColor, string> = {
  gray: colors.textMuted,
  blue: colors.accentBlue,
  yellow: colors.statusAmber,
  orange: colors.syntaxString,
  green: colors.statusGreen,
  red: colors.statusRed,
  purple: colors.statusPurple
}

const CATEGORY_ICONS = {
  backlog: CircleDashed,
  unstarted: Circle,
  started: CircleDot,
  review: CircleDot,
  completed: CircleCheck,
  canceled: CircleX
} satisfies Record<LocalTaskStatusCategory, unknown>

export function LocalTaskStatusIcon(props: {
  category: LocalTaskStatusCategory | null
  color: LocalTaskStatusColor
  size?: number
}) {
  const Icon = props.category ? CATEGORY_ICONS[props.category] : Circle
  return <Icon size={props.size ?? 16} color={LOCAL_TASK_STATUS_COLOR_VALUES[props.color]} />
}

const BAR_HEIGHTS = [5, 8, 11]
// How many of the three bars a priority fills: high 3, medium 2, low 1.
const FILLED_BARS: Record<LocalTaskPriority, number> = { 0: 0, 1: 3, 2: 3, 3: 2, 4: 1 }

export function LocalTaskPriorityIcon(props: { priority: LocalTaskPriority }) {
  if (props.priority === 1) {
    return (
      <View style={styles.urgent}>
        <Text style={styles.urgentText}>!</Text>
      </View>
    )
  }
  const filled = FILLED_BARS[props.priority]
  return (
    <View style={styles.bars}>
      {BAR_HEIGHTS.map((height, index) => (
        <View
          key={height}
          style={[
            styles.bar,
            { height },
            props.priority === 0 ? styles.barNone : index < filled ? styles.barOn : styles.barOff
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12, width: 14 },
  bar: { width: 3, borderRadius: 1 },
  barOn: { backgroundColor: colors.textSecondary },
  barOff: { backgroundColor: colors.bgRaised },
  barNone: { backgroundColor: colors.borderSubtle, height: 2 },
  urgent: {
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: colors.statusRed,
    alignItems: 'center',
    justifyContent: 'center'
  },
  urgentText: { color: colors.onAccent, fontSize: 10, fontWeight: '700', lineHeight: 12 }
})
