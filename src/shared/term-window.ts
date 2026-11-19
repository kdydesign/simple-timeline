export const termWindowChannel = 'termrail:prepare-window'

export interface TermWindowBounds {
  x: number
  y: number
  width: number
  height: number
}
export interface TermWindowApi {
  prepare(bounds?: TermWindowBounds): string | null
}
