import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight, ClipboardList, Monitor } from 'lucide-react-native'
import { PickerModal } from '../components/PickerModal'
import { useConnectedHostPicker } from '../components/use-connected-host-picker'
import { mobileHomeTasksCardStyles as cardStyles } from '../home/MobileHomeTasksCard'
import { useOpenHostStackRoute } from '../navigation/use-open-host-stack-route'
import { colors, spacing, typography } from '../theme/mobile-theme'
import type { HostProfile } from '../transport/types'
import { localTaskHostMachineName } from './local-tasks-access'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskAttentionLine } from './local-task-attention-row'
import type { LocalTaskHomeAttentionRow } from './local-task-home-attention'
import { localTasksRouteTarget } from './local-tasks-route'
import { useLocalTaskHomeHosts, type LocalTaskHomeHost } from './use-local-task-home-hosts'

const HOME_ROWS = 3

type ReadyHost = Extract<LocalTaskHomeHost, { kind: 'ready' }>

export type LocalTaskHomeCardRow = LocalTaskHomeAttentionRow & {
  hostId: string
  executionHost?: `runtime:${string}`
  /** Named only when home counts more than one library (D-008). */
  hostLabel: string | null
}

/** Counts and the tasks waiting longest across every library of every connected host. */
export function summarizeLocalTaskHomeHosts(ready: readonly ReadyHost[]) {
  const copy = localTasksCopy()
  const libraries = ready.flatMap((entry) =>
    entry.libraries.map((library) => ({ hostId: entry.host.id, library }))
  )
  const named = libraries.length > 1
  const read = libraries.flatMap(({ library }) =>
    library.attention === 'error' ? [] : [library.attention]
  )
  const needsYou = read.reduce((sum, attention) => sum + attention.count, 0)
  const parts: string[] = []
  if (read.length > 0) {
    parts.push(copy.work.homeNeedsYou(needsYou))
  }
  parts.push(
    libraries.some(({ library }) => library.inProgress === 'error')
      ? copy.homeCardError
      : copy.homeCardInProgress(
          libraries.reduce(
            (sum, { library }) =>
              sum + (typeof library.inProgress === 'number' ? library.inProgress : 0),
            0
          )
        )
  )
  const rows: LocalTaskHomeCardRow[] = libraries
    .flatMap(({ hostId, library }) =>
      library.attention === 'error'
        ? []
        : library.attention.rows.map((row) => ({
            ...row,
            hostId,
            ...(library.executionHost ? { executionHost: library.executionHost } : {}),
            hostLabel: named ? library.label : null
          }))
    )
    .sort((a, b) => a.since - b.since)
    .slice(0, HOME_ROWS)
  return { subtitle: parts.join(' · '), rows, needsYou: needsYou > 0 }
}

/** Where a host's entry lands: the first of its libraries with something that needs you. */
function homeEntryTarget(host: ReadyHost) {
  const waiting = host.libraries.find(
    (library) => library.attention !== 'error' && library.attention.count > 0
  )
  return localTasksRouteTarget(
    host.host.id,
    waiting ? { view: 'attention' } : undefined,
    waiting?.executionHost ? { executionHost: waiting.executionHost } : undefined
  )
}

/**
 * Home's entry to local tasks. Renders nothing until some host has advertised `local-tasks.v1`, so
 * a phone paired only with older hosts never sees it.
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
  const summary = summarizeLocalTaskHomeHosts(ready)
  const openRow = (row: LocalTaskHomeCardRow) =>
    openHostStackRoute(
      row.hostId,
      localTasksRouteTarget(
        row.hostId,
        { taskId: row.taskId },
        row.executionHost ? { executionHost: row.executionHost } : undefined
      )
    )
  return (
    <View style={styles.stack}>
      {ready.length > 0 ? (
        <View style={[cardStyles.card, styles.column]}>
          <Pressable
            style={({ pressed }) => [styles.header, pressed && cardStyles.cardPressed]}
            onPress={() =>
              picker.pickHost(
                (hostId) => {
                  const host = ready.find((entry) => entry.host.id === hostId)
                  if (host) {
                    openHostStackRoute(hostId, homeEntryTarget(host))
                  }
                },
                ready.map((entry) => entry.host)
              )
            }
            accessibilityRole="button"
            accessibilityLabel={copy.homeCardTitle}
          >
            <View style={cardStyles.icon}>
              <ClipboardList size={18} color={colors.textSecondary} />
            </View>
            <View style={cardStyles.main}>
              <Text style={cardStyles.title}>{copy.homeCardTitle}</Text>
              <Text style={cardStyles.subtitle} numberOfLines={1}>
                {summary.subtitle}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          {summary.rows.map((row) => (
            <Pressable
              key={`${row.hostId}:${row.executionHost ?? ''}:${row.taskId}`}
              style={({ pressed }) => [styles.row, pressed && cardStyles.cardPressed]}
              onPress={() => openRow(row)}
              accessibilityRole="button"
            >
              <Text style={styles.rowTitle} numberOfLines={1}>
                {row.hostLabel ? `${row.hostLabel} · ` : ''}
                {row.ref} {row.title}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {copy.work.attentionKinds[row.item.kind]} · {localTaskAttentionLine(row.item)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {closed.map((host) => (
        <View key={host.id} style={cardStyles.card}>
          <View style={cardStyles.icon}>
            <Monitor size={18} color={colors.statusAmber} />
          </View>
          <View style={cardStyles.main}>
            <Text style={cardStyles.title}>
              {copy.desktopClosed(localTaskHostMachineName(host))}
            </Text>
            <Text style={cardStyles.subtitle}>
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
  column: { flexDirection: 'column', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center' },
  // Why 60: the icon's 46 plus its 14 margin, so rows align under the title.
  row: { paddingTop: spacing.sm, paddingLeft: 60, gap: 2 },
  rowTitle: { color: colors.textPrimary, fontSize: typography.bodySize },
  rowMeta: { color: colors.textMuted, fontSize: typography.metaSize }
})
