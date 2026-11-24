import type { z } from 'zod'
import type { DurableChatComposer } from '../../shared/native-chat-view-recovery/durable-chat-submit'
import { AGENT_TUI_CLEAR_INPUT_MAX } from '../../shared/agent-launch/startup/agent-tui-input-clear'
import { agentImagePasteWrites } from '../../shared/native-chat/input/composer/agent-image-paste'
import { agentImagePastePath } from '../../shared/native-chat/input/composer/agent-image-paste-path'
import { buildNativeChatImagePasteBytes } from '../../shared/native-chat/input/composer/native-chat-paste-bytes'

export async function writeDurableChatComposerPrefix(args: {
  composer: z.infer<typeof DurableChatComposer>
  text: string
  write: (data: string) => Promise<void>
  delay: (ms: number) => Promise<void>
  confirmEmpty: () => Promise<boolean>
}): Promise<void> {
  if (args.composer.clearInput) {
    await args.write(AGENT_TUI_CLEAR_INPUT_MAX)
    await args.delay(140)
    if (!(await args.confirmEmpty())) {
      throw new Error('Chat terminal draft could not be cleared')
    }
  }
  for (const data of agentImagePasteWrites(
    'codex',
    args.composer.imagePaths.map((path) =>
      buildNativeChatImagePasteBytes(agentImagePastePath('codex', path))
    ),
    args.text.trim().length > 0
  )) {
    await args.write(data)
  }
  if (args.composer.imagePaths.length) {
    await args.delay(300)
  }
}
