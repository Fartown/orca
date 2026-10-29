import { MobileLocalTasksScreen } from '../../../src/local-tasks/MobileLocalTasksScreen'

/**
 * The page's route for the local task library: the screen itself. The native route file mounts the
 * shell, whose native view module throws at import in a browser, and the manifest imports every route.
 */
export default function MobileLocalTasksRoute() {
  return <MobileLocalTasksScreen />
}
