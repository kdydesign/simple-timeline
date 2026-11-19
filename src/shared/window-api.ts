import type { HelpSection } from './help'

export type WindowCommand = 'minimize' | 'toggle-maximize' | 'close' | 'state' | 'help' | 'release-notes'
export interface WindowApi {
  command(...args: [command: WindowCommand] | [command: 'help', section: HelpSection]): Promise<{ok: boolean; maximized?: boolean; runtimeVersion?: string}>
}
export const windowChannel = 'window:command'
