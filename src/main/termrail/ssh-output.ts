// Absolute byte offsets let a new renderer replay bounded history while the SSH channel stays open.
export class SshOutput {
  private readonly history = Buffer.alloc(256 * 1024)
  private end = 0
  private consumed = 0

  get allowance() {
    return Math.max(0, 64 * 1024 - (this.end - this.consumed))
  }

  append(data: Buffer) {
    const offset = this.end % this.history.length
    const first = data.copy(this.history, offset)
    if (first < data.length) data.copy(this.history, 0, first)
    this.end += data.length
  }

  acknowledge(cursor: number) {
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > this.end)
      throw new Error('잘못된 터미널 출력 위치입니다.')
    this.consumed = Math.max(this.consumed, cursor)
  }

  read(cursor: number) {
    const start = Math.max(cursor, this.end - this.history.length)
    const count = Math.min(32 * 1024, this.end - start)
    const offset = start % this.history.length
    const data = new Uint8Array(count)
    const first = Math.min(count, this.history.length - offset)
    data.set(this.history.subarray(offset, offset + first))
    if (first < count) data.set(this.history.subarray(0, count - first), first)
    return { data, nextCursor: start + count, truncated: cursor < start, more: start + count < this.end }
  }
}
