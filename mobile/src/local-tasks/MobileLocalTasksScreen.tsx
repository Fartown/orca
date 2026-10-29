import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Monitor } from 'lucide-react-native'
import { useOptionalHostProtocolGates } from '../components/host-protocol-gates-context'
import { useRouteHandoff } from '../navigation/route-handoff'
import { firstParam } from '../navigation/route-param-reader'
import { colors } from '../theme/mobile-theme'
import { useHostClient } from '../transport/host-client-hooks'
import { loadHosts } from '../transport/host-store'
import {
  localTaskEndpointFor,
  SELF_LOCAL_TASK_ENDPOINT,
  type LocalTaskEndpoint,
  type LocalTaskSite
} from './local-task-endpoint'
import { localTaskHostMachineName } from './local-tasks-access'
import { localTasksScreenState } from './local-tasks-screen-state'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTasksLibraryScreen } from './local-tasks-library-screen'
import { localTaskStyles } from './local-tasks-styles'
import { useLocalTaskEndpoints } from './use-local-task-endpoints'
import { useLocalTasksLibrary } from './use-local-tasks-library'

function useHostMachineName(hostId: string | undefined): string {
  const [name, setName] = useState('')
  useEffect(() => {
    let current = true
    void loadHosts().then((hosts) => {
      const host = hosts.find((entry) => entry.id === hostId)
      if (current && host) {
        setName(localTaskHostMachineName(host))
      }
    })
    return () => {
      current = false
    }
  }, [hostId])
  return name
}

/**
 * The task libraries one paired host reaches: its own, and those of the servers it relays to
 * (D-008), one shown at a time. Drawn by the page, so every prompt is a drawer (Alert is a no-op on
 * React Native Web) and Back is the handoff's.
 */
export function MobileLocalTasksScreen() {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const router = useRouteHandoff()
  const params = useLocalSearchParams<{
    hostId?: string | string[]
    view?: string | string[]
    taskId?: string | string[]
    executionHost?: string | string[]
  }>()
  const hostId = firstParam(params.hostId)
  const { client, state: connState } = useHostClient(hostId)
  const gates = useOptionalHostProtocolGates()
  const machineName = useHostMachineName(hostId)
  const routeExecutionHost = firstParam(params.executionHost)
  // Null until the user switches: the route's library, and its focus, until then.
  const [chosen, setChosen] = useState<LocalTaskEndpoint | null>(null)
  // Why memoized: hooks below key their reads on the endpoint's identity.
  const active = useMemo(
    () => chosen ?? localTaskEndpointFor(routeExecutionHost),
    [chosen, routeExecutionHost]
  )
  const { choices, active: reach } = useLocalTaskEndpoints({
    client,
    connState,
    gates,
    machineName,
    active
  })
  const access = reach.access
  const library = useLocalTasksLibrary(
    reach.client,
    access === 'ready',
    `${hostId ?? ''}|${active.key}`
  )
  const exit = () => router.back()
  const showOwn = active.executionHost ? () => setChosen(SELF_LOCAL_TASK_ENDPOINT) : undefined

  const screen = localTasksScreenState(copy, {
    access,
    machineName: reach.accessLabel,
    status: library.status,
    ready: access === 'ready' && reach.client !== null && library.api !== null,
    loaded: library.loaded,
    error: library.error,
    authFailed: connState === 'auth-failed',
    streamEnded: library.streamEnded
  })
  if (screen.kind === 'gate' || !library.api) {
    return (
      <LocalTasksGate
        title={screen.kind === 'gate' ? screen.title : copy.checking}
        message={screen.kind === 'gate' ? screen.message : undefined}
        details={screen.kind === 'gate' ? screen.details : undefined}
        busy={screen.kind === 'gate' ? screen.busy : true}
        onRetry={screen.kind === 'gate' && screen.retry ? () => library.reload() : undefined}
        ownLabel={showOwn && machineName ? copy.showHostTasks(machineName) : undefined}
        onShowOwn={showOwn}
        onBack={exit}
      />
    )
  }
  const canRead = access === 'ready' && reach.client !== null
  const action =
    canRead && library.error
      ? library.retryFailed
      : canRead && library.streamEnded
        ? library.resubscribe
        : null
  const actionLabel = library.error ? copy.retry : copy.reconnect
  const site: LocalTaskSite = {
    hostId: hostId ?? '',
    pairedClient: client,
    endpoint: active,
    client: reach.client,
    connState: reach.connState,
    capabilities: reach.capabilities,
    label: reach.label
  }
  return (
    <View style={localTaskStyles.screen}>
      <LocalTasksLibraryScreen
        key={`${hostId ?? ''}|${active.key}`}
        site={site}
        hosts={choices}
        onSwitchHost={setChosen}
        api={library.api}
        library={library}
        readOnly={screen.readOnly}
        canRead={canRead}
        onExit={exit}
        onNavigate={(href) => router.push(href)}
        initialView={
          chosen === null && firstParam(params.view) === 'attention' ? 'attention' : undefined
        }
        initialTaskId={chosen === null ? firstParam(params.taskId) : undefined}
      />
      {screen.notice ? (
        <View style={[localTaskStyles.notice, { marginBottom: insets.bottom }]}>
          <Text style={localTaskStyles.noticeText}>{screen.notice}</Text>
          {action ? (
            <Pressable
              testID="local-tasks-notice-action"
              style={localTaskStyles.secondaryButton}
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              onPress={action}
            >
              <Text style={localTaskStyles.secondaryButtonText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

function LocalTasksGate(props: {
  title: string
  message?: string
  details?: string
  busy?: boolean
  onRetry?: () => void
  /** Back to the paired host's own library from a server's that cannot open. */
  ownLabel?: string
  onShowOwn?: () => void
  onBack: () => void
}) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const [showDetails, setShowDetails] = useState(false)
  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <View style={localTaskStyles.topBar}>
        <Pressable
          style={localTaskStyles.backButton}
          onPress={props.onBack}
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={localTaskStyles.backLabel}>{copy.back}</Text>
        </Pressable>
      </View>
      <View style={localTaskStyles.centered}>
        {props.busy ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : (
          <Monitor size={28} color={colors.textMuted} />
        )}
        <Text style={localTaskStyles.centeredTitle}>{props.title}</Text>
        {props.message ? <Text style={localTaskStyles.centeredText}>{props.message}</Text> : null}
        {props.details ? (
          <Pressable
            onPress={() => setShowDetails((shown) => !shown)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showDetails }}
          >
            <Text style={localTaskStyles.sectionActionText}>
              {showDetails ? copy.hideDetails : copy.showDetails}
            </Text>
          </Pressable>
        ) : null}
        {props.details && showDetails ? (
          <Text style={localTaskStyles.mono} selectable>
            {props.details}
          </Text>
        ) : null}
        {props.onRetry ? (
          <Pressable
            style={localTaskStyles.secondaryButton}
            onPress={props.onRetry}
            accessibilityRole="button"
          >
            <Text style={localTaskStyles.secondaryButtonText}>{copy.retry}</Text>
          </Pressable>
        ) : null}
        {props.onShowOwn && props.ownLabel ? (
          <Pressable
            style={localTaskStyles.secondaryButton}
            onPress={props.onShowOwn}
            accessibilityRole="button"
          >
            <Text style={localTaskStyles.secondaryButtonText}>{props.ownLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}
