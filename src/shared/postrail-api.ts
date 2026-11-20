import type {PrLibrary, PrMutation} from './postrail'
import type {PrDetail, PrRow, PrRunState, PrStart} from './postrail-run'

export const postRailChannel = 'postrail:command'
export const postRailChanged = 'postrail:changed'
export type PostRailChange = 'library' | 'run'

export interface PostRailApi {
  read(): Promise<PrLibrary>
  capability(): Promise<boolean>
  state(): Promise<PrRunState>
  mutate(command: PrMutation): Promise<PrLibrary>
  logout(environmentId: string): Promise<void>
  start(input: PrStart): Promise<PrRunState | null>
  stop(): Promise<PrRunState>
  page(offset: string, runId: string): Promise<PrRow[]>
  detail(iteration: string, runId: string): Promise<PrDetail | null>
  onChange(callback: (change: PostRailChange) => void): () => void
}
