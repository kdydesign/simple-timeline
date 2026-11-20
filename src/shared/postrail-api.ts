import type {PrConsoleLine, PrDraftProblem} from './postrail-console'
import type {PrFile, PrLibrary, PrMethod, PrMutation} from './postrail'
import type {PrDetail, PrRow, PrRunState, PrStart} from './postrail-run'

export const postRailChannel = 'postrail:command'
export const postRailChanged = 'postrail:changed'
export type PostRailChange = 'library' | 'run'

export interface PostRailApi {
  read(): Promise<PrLibrary>
  chooseFile(requestId:string, retainedIds?:string[]):Promise<PrFile|null>
  capability(): Promise<boolean>
  state(): Promise<PrRunState>
  consoleSince(after: number): Promise<PrConsoleLine[]>
  invalidDraft(requestId: string, environmentId: string, category: PrDraftProblem, method: PrMethod, diagnosis: string, attemptId?: string): Promise<void>
  mutate(command: PrMutation): Promise<PrLibrary>
  logout(environmentId: string): Promise<void>
  start(input: PrStart): Promise<PrRunState | null>
  stop(): Promise<PrRunState>
  page(offset: string, runId: string): Promise<PrRow[]>
  detail(iteration: string, runId: string): Promise<PrDetail | null>
  onChange(callback: (change: PostRailChange) => void): () => void
}
