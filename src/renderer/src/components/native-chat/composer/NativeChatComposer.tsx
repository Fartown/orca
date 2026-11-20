import { NativeChatTextAttachmentScope } from '../media/text/NativeChatTextAttachments'
import { forwardRef } from 'react'
import { NativeChatComposerPane } from './NativeChatComposerPane'
import { LocalTaskDispatcherPanelDock } from '@/components/local-tasks/LocalTaskDispatcherPanelDock'
import type {
  NativeChatComposerHandle,
  NativeChatComposerProps
} from './native-chat-composer-types'

export const NativeChatComposer = forwardRef<NativeChatComposerHandle, NativeChatComposerProps>(
  function NativeChatComposer(props, ref): React.JSX.Element {
    return (
      <NativeChatTextAttachmentScope
        key={props.paneKey}
        enabled={Boolean(props.structuredTransport)}
      >
        <LocalTaskDispatcherPanelDock tabId={props.terminalTabId} />
        <NativeChatComposerPane {...props} ref={ref} />
      </NativeChatTextAttachmentScope>
    )
  }
)
