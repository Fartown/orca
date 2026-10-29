import { useRef, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { colors, spacing } from '../theme/mobile-theme'

export type LocalTaskSwipeAction = {
  label: string
  tone: 'neutral' | 'accent'
  onPress: () => void
}

const ACTION_WIDTH = 84

/**
 * A row that slides left to reveal its actions. A horizontal scroller rather than a gesture
 * handler: it behaves the same natively and inside the shell's page, where the list renders.
 */
export function LocalTaskSwipeRow(props: { actions: LocalTaskSwipeAction[]; children: ReactNode }) {
  const scroller = useRef<ScrollView>(null)
  const [width, setWidth] = useState(0)
  const revealed = ACTION_WIDTH * props.actions.length
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView
        ref={scroller}
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        snapToOffsets={[0, revealed]}
        decelerationRate="fast"
      >
        <View style={width > 0 ? { width } : styles.measuring}>{props.children}</View>
        {props.actions.map((action) => (
          <Pressable
            key={action.label}
            style={[styles.action, action.tone === 'accent' && styles.accent]}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => {
              scroller.current?.scrollTo({ x: 0, animated: true })
              action.onPress()
            }}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  measuring: { width: '100%' },
  action: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgRaised
  },
  accent: { backgroundColor: colors.statusAmber },
  actionText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600', textAlign: 'center' }
})
