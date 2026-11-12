import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight, ClipboardList, Monitor } from 'lucide-react-native'
import { PickerModal } from '../components/PickerModal'
import { useConnectedHostPicker } from '../components/use-connected-host-picker'
import { useOpenHostStackRoute } from '../navigation/use-open-host-stack-route'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import type { HostProfile } from '../transport/types'
import { localTaskHostMachineName } from './local-tasks-access'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { localTaskAttentionLine } from './local-task-attention-row'
import { localTasksPageCopy } from './local-tasks-page-copy'
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

/** Counts, "Needs you" rows and the newest writeback across every library of every connected host. */
export function summarizeLocalTaskHomeHosts(ready: readonly ReadyHost[]) {
  const libraries = ready.flatMap((entry) =>
    entry.libraries.map((library) => ({ hostId: entry.host.id, library }))
  )
  const named = libraries.length > 1
  const read = libraries.flatMap(({ library }) =>
    library.attention === 'error' ? [] : [library.attention]
  )
  const needsYou = read.reduce((sum, attention) => sum + attention.count, 0)
  const inProgress = libraries.some(({ library }) => library.inProgress === 'error')
    ? null
    : libraries.reduce(
        (sum, { library }) =>
          sum + (typeof library.inProgress === 'number' ? library.inProgress : 0),
        0
      )
  const latest =
    libraries
      .flatMap(({ hostId, library }) =>
        library.attention !== 'error' && library.attention.latest
          ? [
              {
                ...library.attention.latest,
                hostId,
                ...(library.executionHost ? { executionHost: library.executionHost } : {})
              }
            ]
          : []
      )
      .sort((a, b) => b.at - a.at)[0] ?? null
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
    .slice(0, HOME_ROWS)
  return {
    /** Null until some library's "Needs you" was read. */
    needsYou: read.length > 0 ? needsYou : null,
    /** Null when some library's count could not be read. */
    inProgress,
    rows,
    latest,
    openCount: read.reduce((sum, attention) => sum + attention.openCount, 0)
  }
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
 * Home's entry to local tasks. Renders nothing until a host in contact has a task library with a
 * project, so a phone paired only with older hosts, or with hosts nobody created a project on,
 * never sees it. A host that had one and is out of contact now gets a "cannot connect" line.
 */
export function MobileHomeLocalTasksCard(props: { connectedHosts: HostProfile[] }) {
  const copy = localTasksCopy()
  const hosts = useLocalTaskHomeHosts(props.connectedHosts)
  const openHostStackRoute = useOpenHostStackRoute()
  const picker = useConnectedHostPicker(props.connectedHosts)
  const ready = hosts.flatMap((entry) => (entry.kind === 'ready' ? [entry] : []))
  // Why the newest read and no clock: relative times move only when home reads again.
  const now = ready.reduce((latest, entry) => Math.max(latest, entry.readAt), 0)
  const unreachable = hosts.flatMap((entry) => (entry.kind === 'unreachable' ? [entry] : []))
  if (ready.length === 0 && unreachable.length === 0) {
    return null
  }
  const summary = summarizeLocalTaskHomeHosts(ready)
  const page = localTasksPageCopy()
  const openTask = (row: { hostId: string; taskId: string; executionHost?: `runtime:${string}` }) =>
    openHostStackRoute(
      row.hostId,
      localTasksRouteTarget(
        row.hostId,
        { taskId: row.taskId },
        row.executionHost ? { executionHost: row.executionHost } : undefined
      )
    )
  const openEntry = (attention: boolean) =>
    picker.pickHost(
      (hostId) => {
        const host = ready.find((entry) => entry.host.id === hostId)
        if (host) {
          openHostStackRoute(
            hostId,
            attention ? homeEntryTarget(host) : localTasksRouteTarget(hostId)
          )
        }
      },
      ready.map((entry) => entry.host)
    )
  return (
    <View style={styles.stack}>
      {ready.length > 0 ? (
        <View style={[styles.card, styles.column]}>
          <Pressable
            style={({ pressed }) => [styles.header, pressed && styles.cardPressed]}
            onPress={() => openEntry(true)}
            accessibilityRole="button"
            accessibilityLabel={copy.homeCardTitle}
          >
            <View style={styles.icon}>
              <ClipboardList size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.main}>
              <Text style={styles.title}>{copy.homeCardTitle}</Text>
            </View>
            <ChevronRight size={16} color={colors.textMuted} />
          </Pressable>
          <View style={styles.counters}>
            <Pressable
              style={styles.counter}
              onPress={() => openEntry(true)}
              accessibilityRole="button"
              testID="local-tasks-home-needs-you"
            >
              <Text style={[styles.count, styles.attention]}>{summary.needsYou ?? '–'}</Text>
              <Text style={styles.subtitle}>{page.homeNeedsYou}</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              style={styles.counter}
              onPress={() => openEntry(false)}
              accessibilityRole="button"
              testID="local-tasks-home-in-progress"
            >
              <Text style={styles.count}>{summary.inProgress ?? '–'}</Text>
              <Text style={styles.subtitle}>
                {summary.inProgress === null ? copy.homeCardError : page.homeInProgress}
              </Text>
            </Pressable>
          </View>
          {summary.rows.map((row) => (
            <Pressable
              key={`${row.hostId}:${row.executionHost ?? ''}:${row.taskId}`}
              style={({ pressed }) => [styles.row, pressed && styles.cardPressed]}
              onPress={() => openTask(row)}
              accessibilityRole="button"
            >
              <View style={styles.rowHead}>
                <Text style={styles.ref}>{row.ref}</Text>
                <Text style={[styles.kind, row.item ? styles.attention : styles.review]}>
                  {row.item
                    ? copy.work.attentionKinds[row.item.kind]
                    : copy.work.card.awaitingAcceptance}
                </Text>
                <Text style={[styles.rowMeta, styles.time]} numberOfLines={1}>
                  {formatLocalTaskAgo(copy, row.since, now)}
                </Text>
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {row.item ? localTaskAttentionLine(row.item) : row.title}
                {row.hostLabel ? ` · ${row.hostLabel}` : ''}
              </Text>
            </Pressable>
          ))}
          {summary.latest ? (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.cardPressed]}
              onPress={() => summary.latest && openTask(summary.latest)}
              accessibilityRole="button"
            >
              <View style={styles.rowHead}>
                <Text style={styles.ref}>{summary.latest.ref}</Text>
                <Text style={styles.kind}>
                  {page.homeLatest(
                    summary.latest.writeback ? copy.work.card.writeback : copy.work.card.lastLine
                  )}
                </Text>
                <Text style={[styles.rowMeta, styles.time]} numberOfLines={1}>
                  {formatLocalTaskAgo(copy, summary.latest.at, now)}
                </Text>
              </View>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {summary.latest.body}
              </Text>
            </Pressable>
          ) : null}
          {summary.openCount > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.viewAll, pressed && styles.cardPressed]}
              onPress={() => openEntry(false)}
              accessibilityRole="button"
            >
              <Text style={[styles.viewAllText, styles.attention]}>
                {page.homeViewAll(summary.openCount)}
              </Text>
              <ChevronRight size={14} color={colors.statusAmber} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {unreachable.map(({ host, pairingInvalid }) => (
        <View key={host.id} style={styles.card}>
          <View style={styles.icon}>
            <Monitor size={18} color={colors.statusAmber} />
          </View>
          <View style={styles.main}>
            <Text style={styles.title}>
              {copy.desktopDisconnected(localTaskHostMachineName(host))}
            </Text>
            {pairingInvalid ? <Text style={styles.subtitle}>{copy.pairingInvalid}</Text> : null}
          </View>
        </View>
      ))}
      <PickerModal title={copy.pickHostTitle} {...picker.pickerProps} />
    </View>
  )
}

// Why these values: the card sits under home's task card and matches its frame, icon and type.
const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.surface,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    paddingVertical: 12
  },
  cardPressed: { backgroundColor: colors.bgRaised },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: colors.bgRaised,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14
  },
  main: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  stack: { gap: spacing.sm, marginTop: spacing.sm },
  column: { flexDirection: 'column', alignItems: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center' },
  counters: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  counter: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  count: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginRight: 14
  },
  attention: { color: colors.statusAmber },
  review: { color: colors.statusGreen },
  row: {
    paddingVertical: spacing.sm,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ref: {
    fontFamily: typography.monoFamily,
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  kind: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  time: { marginLeft: 'auto' },
  rowTitle: { color: colors.textPrimary, fontSize: typography.bodySize },
  rowMeta: { color: colors.textMuted, fontSize: typography.metaSize },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  viewAllText: { fontSize: typography.bodySize, fontWeight: '600' }
})
