import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import {
  DEFAULT_LOCAL_TASK_STATUSES,
  type LocalTaskPriority,
  type LocalTaskStatusCategory,
  type LocalTaskStatusColor
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

/** The colour a category's default status gets, for a category shown without a status. */
export function localTaskCategoryColor(category: LocalTaskStatusCategory): LocalTaskStatusColor {
  return DEFAULT_LOCAL_TASK_STATUSES.find((entry) => entry.category === category)?.color ?? 'gray'
}

// Paths only, on desktop's 14-unit grid (LocalTaskIcons.tsx), so each category reads the same there.
const RING = 'M7 1.25a5.75 5.75 0 1 1 0 11.5a5.75 5.75 0 1 1 0-11.5Z'
const DISC = 'M7 0.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13Z'
const HALF = 'M7 3.5A3.5 3.5 0 0 1 7 10.5Z'
const THREE_QUARTERS = 'M7 3.5A3.5 3.5 0 1 1 3.5 7H7Z'
const CHECK = 'M4.4 7.2l1.8 1.8 3.5-3.6'
const CROSS = 'M5 5l4 4M9 5l-4 4'

/** The category decides the glyph, the status colour fills it, as on the desktop. */
export function LocalTaskStatusIcon(props: {
  category: LocalTaskStatusCategory | null
  color: LocalTaskStatusColor
  size?: number
}) {
  const fill = LOCAL_TASK_STATUS_COLOR_VALUES[props.color]
  const size = props.size ?? 16
  const { category } = props
  const ring = (
    <Path
      d={RING}
      fill="none"
      stroke={fill}
      strokeWidth={1.5}
      strokeDasharray={category === 'backlog' ? '2.1 2.42' : undefined}
    />
  )
  const mark = category === 'completed' ? CHECK : category === 'canceled' ? CROSS : null
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14">
      {mark ? <Path d={DISC} fill={fill} /> : ring}
      {category === 'started' ? <Path d={HALF} fill={fill} /> : null}
      {category === 'review' ? <Path d={THREE_QUARTERS} fill={fill} /> : null}
      {mark ? (
        <Path
          d={mark}
          fill="none"
          stroke={colors.bgBase}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
    </Svg>
  )
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
