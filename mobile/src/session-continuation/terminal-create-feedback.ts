import { triggerError } from '../platform/haptics'

export function terminalCreateFeedback(scope: {
  isCurrent: () => boolean
  isFork: boolean
  errorToast?: string
  setCreateError: (message: string) => void
  showToast: (message: string, duration: number) => void
}) {
  const report = (message: string, toast: string, duration: number): void => {
    if (!scope.isCurrent()) {
      return
    }
    scope.setCreateError(message)
    triggerError()
    scope.showToast(toast, duration)
  }
  return {
    reportFork: (message: string): void => {
      if (scope.isFork) {
        report(message, message, 3000)
      }
    },
    reportCreateFailure: (hostReason: string): void => {
      const reason = hostReason.trim() || scope.errorToast || 'Failed to create terminal'
      report(reason, scope.errorToast ?? reason, 1800)
    }
  }
}
