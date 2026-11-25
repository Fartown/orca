import { z } from 'zod'

export const TERMINAL_FOREGROUND_INSPECTION_PARAMS = {
  scanChildProcesses: z.boolean().optional(),
  foregroundOnly: z.boolean().optional()
}
