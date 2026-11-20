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
const sourceBytes = 16 * 1024
const omitted = '… 오류 원문 일부 생략'

export class PostRailConsole {
  private lines: PrConsoleLine[] = []
  private readonly recordedAttempts = new Set<string>()
  private errors = new Map<string, PrSendError>()
  version = 0

  constructor(private readonly changed: () => void) {}

  write(context: Context, message: string, options: {error?:boolean, preflight?:boolean, iteration?:string, durationMs?:number, source?:string} = {}) {
    const {requestId, environmentId, requestName, environmentName, method} = context
    const time = new Date().toTimeString().slice(0, 8)
    const text = [time, options.error ? 'ERROR' : 'INFO', label(requestName), label(environmentName), method,
      options.iteration && options.iteration + '회차', message,
      options.durationMs !== undefined && options.durationMs + 'ms'].filter(Boolean).join(' · ')
    this.append(text, !!options.error)
    if (options.error && options.source) this.appendSource(options.source)
    if (options.error) this.errors.set(JSON.stringify([requestId, environmentId]), {
      requestId, environmentId, message, preflight: !!options.preflight,
    })
    this.changed()
  }

  private append(text:string, error:boolean, ending?:string) {
    const id = ++this.version
    this.lines[(id-1) % limit] = {id,text,error,ending}
  }

  private appendSource(source:string) {
    // Mask the complete source upstream before capping bytes, so a token spanning
    // the boundary cannot leak a prefix. Avoid allocating a full second buffer.
    const bytes = Buffer.from(source.slice(0,sourceBytes + 1))
    let end = Math.min(bytes.length,sourceBytes)
    let truncated = end < bytes.length
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--
    const text = bytes.toString('utf8',0,end)
    const endings = /\r\n|[\r\n\u2028\u2029]/g
    let start = 0, count = 0
    for (const match of text.matchAll(endings)) {
      if (count === limit-2) { truncated = true; break }
      this.append(text.slice(start,match.index),true,match[0])
      start = match.index + match[0].length
      count++
    }
    if (start < text.length) {
      if (count < limit-2) this.append(text.slice(start),true)
      else truncated = true
    }
    if (truncated) this.append(omitted,true)
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
