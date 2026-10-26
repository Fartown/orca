import { useEffect, useState } from 'react'
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
import { localTaskHostMachineName, resolveLocalTasksAccess } from './local-tasks-access'
import { localTasksScreenState } from './local-tasks-screen-state'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTasksLibraryScreen } from './local-tasks-library-screen'
import { localTaskStyles } from './local-tasks-styles'
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
 * The local task library of one paired desktop. Drawn by the page, so every prompt is a drawer
 * (Alert is a no-op on React Native Web) and Back is the handoff's.
 */
export function MobileLocalTasksScreen() {
  const copy = localTasksCopy()
  const router = useRouteHandoff()
  const params = useLocalSearchParams<{ hostId?: string | string[] }>()
  const hostId = firstParam(params.hostId)
  const { client, state: connState } = useHostClient(hostId)
  const gates = useOptionalHostProtocolGates()
  const machineName = useHostMachineName(hostId) || (hostId ?? '')
  const access = resolveLocalTasksAccess({
    connState,
    statusPending: gates?.statusPending ?? true,
    statusReadable: gates?.statusReadable ?? false,
    capabilities: gates?.hostCapabilities ?? []
  })
  const library = useLocalTasksLibrary(client, access === 'ready')
  const exit = () => router.back()

  const screen = localTasksScreenState(copy, {
    access,
    machineName,
    status: library.status,
    ready: access === 'ready' && client !== null && library.api !== null,
    loaded: library.loaded,
    error: library.error
  })
  if (screen.kind === 'gate' || !client || !library.api) {
    return (
      <LocalTasksGate
        title={screen.kind === 'gate' ? screen.title : copy.checking}
        message={screen.kind === 'gate' ? screen.message : undefined}
        details={screen.kind === 'gate' ? screen.details : undefined}
        busy={screen.kind === 'gate' ? screen.busy : true}
        onRetry={screen.kind === 'gate' && screen.retry ? () => library.reload() : undefined}
        onBack={exit}
      />
    )
  }
  return (
    <LocalTasksLibraryScreen
      client={client}
      api={library.api}
      library={library}
      readOnly={screen.readOnly}
      notice={screen.notice}
      onExit={exit}
    />
  )
}

function LocalTasksGate(props: {
  title: string
  message?: string
  details?: string
  busy?: boolean
  onRetry?: () => void
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
      </View>
    </View>
  )
}
