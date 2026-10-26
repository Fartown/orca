import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight, ListTodo, Monitor } from 'lucide-react-native'
import { PickerModal } from '../components/PickerModal'
import { useConnectedHostPicker } from '../components/use-connected-host-picker'
import { useOpenHostStackRoute } from '../navigation/use-open-host-stack-route'
import { colors, radii, spacing } from '../theme/mobile-theme'
import type { HostProfile } from '../transport/types'
import { localTaskHostMachineName } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksRouteTarget } from './local-tasks-route'
import { useLocalTaskHomeHosts } from './use-local-task-home-hosts'

/**
 * Home's entry to local tasks. Renders nothing until some desktop has advertised `local-tasks.v1`,
 * so a phone paired only with older desktops or servers never sees it.
 */
export function MobileHomeLocalTasksCard(props: { connectedHosts: HostProfile[] }) {
  const copy = localTasksCopy()
  const hosts = useLocalTaskHomeHosts(props.connectedHosts)
  const openHostStackRoute = useOpenHostStackRoute()
  const picker = useConnectedHostPicker(props.connectedHosts)
  const ready = hosts.flatMap((entry) => (entry.kind === 'ready' ? [entry] : []))
  const closed = hosts.flatMap((entry) => (entry.kind === 'closed' ? [entry.host] : []))
  if (ready.length === 0 && closed.length === 0) {
    return null
  }
  const counts = ready.map((entry) => entry.inProgress)
  const subtitle = counts.some((count) => count === null)
    ? copy.homeCardLoading
    : copy.homeCardInProgress(counts.reduce<number>((sum, count) => sum + (count ?? 0), 0))
  return (
    <View style={styles.stack}>
      {ready.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() =>
            picker.pickHost(
              (hostId) => openHostStackRoute(hostId, localTasksRouteTarget(hostId)),
              ready.map((entry) => entry.host)
            )
          }
          accessibilityRole="button"
          accessibilityLabel={copy.homeCardTitle}
        >
          <View style={styles.icon}>
            <ListTodo size={18} color={colors.textSecondary} />
          </View>
          <View style={styles.main}>
            <Text style={styles.title}>{copy.homeCardTitle}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {closed.map((host) => (
        <View key={host.id} style={styles.card}>
          <View style={styles.icon}>
            <Monitor size={18} color={colors.statusAmber} />
          </View>
          <View style={styles.main}>
            <Text style={styles.title}>{copy.desktopClosed(localTaskHostMachineName(host))}</Text>
            <Text style={styles.subtitle}>
              {copy.desktopClosedHint(localTaskHostMachineName(host))}
            </Text>
          </View>
        </View>
      ))}
      <PickerModal title={copy.pickHostTitle} {...picker.pickerProps} />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm, marginTop: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: 12
  },
  cardPressed: { backgroundColor: colors.bgRaised },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 3, lineHeight: 17 }
})
