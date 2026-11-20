import type {PrConsoleLine, PrSendError} from '../../shared/postrail-console'
import type {PrMethod} from '../../shared/postrail'

interface Context {
  requestId: string
  environmentId: string
  requestName: string
  environmentName: string
  method: PrMethod
}

function label(name: string) {
  return name.slice(0, 200).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
}

const limit = 1000

export class PostRailConsole {
  private lines: PrConsoleLine[] = []
  private readonly recordedAttempts = new Set<string>()
  private errors = new Map<string, PrSendError>()
  version = 0

  constructor(private readonly changed: () => void) {}

  write(context: Context, message: string, options: {error?:boolean, preflight?:boolean, iteration?:string, durationMs?:number} = {}) {
    const {requestId, environmentId, requestName, environmentName, method} = context
    const time = new Date().toTimeString().slice(0, 8)
    const text = [time, options.error ? 'ERROR' : 'INFO', label(requestName), label(environmentName), method,
      options.iteration && options.iteration + '회차', message,
      options.durationMs !== undefined && options.durationMs + 'ms'].filter(Boolean).join(' · ')
    const id = ++this.version
    this.lines[(id - 1) % limit] = {id, text, error: !!options.error}
    if (options.error) this.errors.set(JSON.stringify([requestId, environmentId]), {
      requestId, environmentId, message, preflight: !!options.preflight,
    })
    this.changed()
  }

  since(after: number): PrConsoleLine[] {
    const lines: PrConsoleLine[] = []
    for (let id = Math.max(after + 1, this.version - this.lines.length + 1); id <= this.version; id++) {
      lines.push(this.lines[(id - 1) % limit])
    }
    return lines
  }

  hasAttempt(id: string) { return this.recordedAttempts.has(id) }

  recordAttempt(id: string) {
    this.recordedAttempts.add(id)
    if (this.recordedAttempts.size > limit) this.recordedAttempts.delete(this.recordedAttempts.values().next().value!)
  }

  sendErrors() { return [...this.errors.values()] }

  succeeded(context: Context) {
    this.errors.delete(JSON.stringify([context.requestId, context.environmentId]))
  }

  close() {
    this.lines = []
    this.errors.clear()
    this.recordedAttempts.clear()
    this.version = 0
  }
}
