// Both a readline mode transition and a complete, conventional PS1 are required
// when the shell does not emit semantic prompt boundaries.
const conventionalPrompt = /^(?:[\w.-]+@[\w.-]+:[~/][\p{L}\p{N}._~+/-]*|\[[\w.-]+@[\w.-]+ [\p{L}\p{N}._~+/-]+\])[$#] /u

const maxLine = 4096
const maxOutput = 1024 * 1024

function asksForInput(line: string): boolean {
  // user@host: can be the first packet of a conventional PS1.
  return /[?？](?:\s*(?:\[[^\]]*\]|\([^)]*\)))?\s*$/.test(line)
    || (/[:：]\s*$/.test(line) && !/^[\w.-]+@[\w.-]+:$/.test(line))
    || /(?:\[(?:y\/n|yes\/no)\]|\((?:y\/n|yes\/no)\))\s*$/i.test(line)
    || /^\s*(?:[\w-]*>|\.\.\.)\s*$|--more--\s*$/i.test(line)
    || /\bpress\s+\[?(?:any key|enter|return)\b/i.test(line)
    || /\b(?:select|choose)\s+.*\[[^\]]+\]\s*$/i.test(line)
}

type Phase = 'output' | 'readline' | 'semantic' | 'ready'
type Control = 'text' | 'escape' | 'csi' | 'osc' | 'osc-escape'

export class StartupPrompt {
  private readonly decoder = new TextDecoder('utf-8', {fatal: true})
  private phase: Phase = 'output'
  private control: Control = 'text'
  private sequence = ''
  private line = ''
  private bytes = 0
  private manual = false

  private submitted: boolean
  private expectedEcho?: string
  private echoAwaitingLf = false

  constructor(previousLine?: string) {
    this.submitted = previousLine === undefined
    if (previousLine?.trim()) this.expectedEcho = previousLine
  }

  push(chunk: Buffer): 'prompt' | 'manual' | undefined {
    this.bytes += chunk.length
    if (this.bytes > maxOutput) this.manual = true
    if (this.manual) return 'manual'
    let text: string
    try {
      text = this.decoder.decode(chunk, {stream: true})
    } catch {
      this.manual = true
      return 'manual'
    }
    for (const char of text) {
      this.consume(char)
      if (this.manual) return 'manual'
    }
    if (!chunk.length || this.control !== 'text') return
    if (asksForInput(this.line)) this.manual = true
    if (this.phase === 'readline') {
      const match = conventionalPrompt.exec(this.line)
      if (match) {
        if (match[0] !== this.line) this.manual = true
        else this.phase = 'ready'
      }
    }
    if (this.phase === 'ready' && !this.submitted) this.manual = true
    if (this.manual) return 'manual'
    // A partial UTF-8 character after a candidate can still become extra input.
    if (this.phase === 'ready' && chunk[chunk.length - 1] < 0x80) return 'prompt'
  }

  private consume(char: string): void {
    if (this.echoAwaitingLf) {
      if (char === '\n') this.submitted = true
      this.echoAwaitingLf = false
    }
    switch (this.control) {
      case 'escape':
        if (char === '[') this.control = 'csi'
        else if (char === ']') this.control = 'osc'
        else this.manual = true
        return
      case 'csi':
        this.sequence += char
        if (/^[@-~]$/.test(char)) {
          this.csi(this.sequence)
          this.finishControl()
        } else if (!/^[ -?]$/.test(char) || this.sequence.length > maxLine) this.manual = true
        return
      case 'osc-escape':
        if (char !== '\\') this.manual = true
        else this.finishOsc()
        return
      case 'osc':
        if (char === '\x07') this.finishOsc()
        else if (char === '\x1b') this.control = 'osc-escape'
        else if (char < ' ' || this.sequence.length >= maxLine) this.manual = true
        else this.sequence += char
        return
      case 'text':
        if (char === '\x1b') this.control = 'escape'
        else if (char === '\r' || char === '\n') {
          if (this.phase === 'output' && this.line === this.expectedEcho) {
            if (char === '\n') this.submitted = true
            else this.echoAwaitingLf = true
          } else if (this.phase !== 'output' || asksForInput(this.line)) this.manual = true
          // Only the first output line can be the command echo.
          this.expectedEcho = undefined
          this.line = ''
        } else if (char === '\x07') return
        else if (this.phase === 'ready' || this.line.length >= maxLine || /[\x00-\x08\x0a-\x1f\x7f-\x9f]/.test(char)) {
          this.manual = true
        } else this.line += char
    }
  }

  private csi(sequence: string): void {
    if (/^[\d;:]*m$/.test(sequence)) return
    if (sequence === '?2004h') {
      if (this.phase === 'output' && !this.line) this.phase = 'readline'
      else if (this.phase === 'output') this.manual = true
    } else if (sequence === '?2004l' && this.phase === 'output') {
      this.submitted = true
    } else this.manual = true
  }

  private finishOsc(): void {
    const [type, marker, ...options] = this.sequence.split(';')
    this.finishControl()
    if (type !== '133') {
      if (!['0', '1', '2', '7', '8'].includes(type)) this.manual = true
      return
    }
    if (options.some(option => option.startsWith('k=') && option !== 'k=i')) {
      this.manual = true
      return
    }
    switch (marker) {
      case 'A':
        if ((this.phase === 'output' || this.phase === 'readline') && !this.line) this.phase = 'semantic'
        else this.manual = true
        break
      case 'B':
        if (this.phase === 'semantic' && this.line.trim() && !asksForInput(this.line)) this.phase = 'ready'
        else this.manual = true
        break
      case 'P':
        if (this.phase !== 'semantic' || !options.includes('k=i')) this.manual = true
        break
      case 'C':
      case 'D':
        if (this.phase === 'output') this.submitted = true
        else this.manual = true
        break
      default:
        this.manual = true
    }
  }

  private finishControl(): void {
    this.sequence = ''
    this.control = 'text'
  }
}
