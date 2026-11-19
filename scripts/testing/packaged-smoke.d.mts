export function normalizeArchivePath(value: string): string
export function inspectPackage(directory: string, options?: {sourceSha?: string; version?: string}): Promise<{
  arch: 'x64'
  version: string
  sourceSha: string | null
  main: string
  executable: string
  shellIcon: {file: string; sizes: number[]}
  nativeBinding: string
  archive: string
  files: number
}>
