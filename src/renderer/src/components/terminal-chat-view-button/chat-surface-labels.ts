import { translate } from '@/i18n/i18n'

/** Shows the same live CLI session as chat in place; the agent keeps running in its terminal. */
export function switchToChatViewLabel(): string {
  return translate('components.terminal-chat-view-button.switchToChatView', 'Switch to Chat View')
}

/** Hands the CLI conversation to a new chat, which needs the terminal agent gone first. */
export function takeOverInNewChatLabel(): string {
  return translate('components.terminal-chat-view-button.takeOverInNewChat', 'Move to New Chat')
}
