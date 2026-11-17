export type WindowCommand = 'minimize' | 'toggle-maximize' | 'close' | 'state' | 'help' | 'release-notes'
export interface WindowApi {
  command(command: WindowCommand): Promise<{ok: boolean; maximized?: boolean}>
}
export const windowChannel = 'window:command'
