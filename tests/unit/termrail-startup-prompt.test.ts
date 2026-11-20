import {expect, it} from 'vitest'
import {StartupPrompt} from '../../src/main/termrail/startup-prompt'

const paste = '\x1b[?2004h'
const start = '\x1b]133;A\x07'
const end = '\x1b]133;B\x1b\\'

it.each([
  start + '\x1b]133;P;k=i\x07remote$ ' + end,
  start + '\x1b[32m작업 ❯\x1b[0m ' + end,
  paste + '\x1b]0;터미널\x07\x1b[32malice@dev:~/작업\x1b[0m$ ',
  paste + '[root@dev.example tmp]# ',
])('recognizes the entire prompt across any packet boundary', sample => {
  const prompt = new StartupPrompt()
  const bytes = Buffer.from(sample)
  for (const byte of bytes.subarray(0, -1)) {
    expect(prompt.push(Buffer.from([byte]))).toBeUndefined()
  }
  expect(prompt.push(bytes.subarray(-1))).toBe('prompt')
})

it.each([
  '$ ', '> file.txt\r\n', 'alice@dev:~$ ', end, paste + '$ ',
  paste + 'printed alice@dev:~$ ', start + 'alice@dev:~$ ',
  start + paste + 'alice@dev:~$ ', '\x1b]0;' + paste + 'alice@dev:~$ \x07',
])('requires evidence for a complete primary prompt', sample => {
  expect(new StartupPrompt().push(Buffer.from(sample))).not.toBe('prompt')
})

it.each([
  '\x1b]133;A;k=s\x07' + 'next $ ' + end,
  '\x1b]133;P;k=s\x1b\\' + '> ',
  start + '> ' + end, start + '>' + end, paste + 'heredoc> ',
  'Continue (yes/no)? ', '[sudo] password for alice: ', 'Overwrite [y/N] ',
  start + 'Enter a value: ' + end, start + 'Input:' + end, 'Press ENTER to continue',
  'Password:\r\n' + start + '$ ' + end,
  paste + 'alice@dev:~$ already typed',
  start + '$ ' + end + 'already typed',
  paste + 'alice@dev:~$ \r\nother output',
  start + '$ ' + end + '\r\nother output',
  'Continue?\r\n' + paste + 'alice@dev:~$ ',
  paste + '\x1b[2Jalice@dev:~$ ',
])('relinquishes automation on questions, continuations and stale prompts', sample => {
  const prompt = new StartupPrompt()
  expect(prompt.push(Buffer.from(sample))).toBe('manual')
  expect(prompt.push(Buffer.from(start + '$ ' + end))).toBe('manual')
})

it('requires fresh evidence after each command and discards the preceding echo', () => {
  const prompt = new StartupPrompt()
  expect(prompt.push(Buffer.from(paste + 'alice@dev:~$ '))).toBe('prompt')
  prompt.reset()
  expect(prompt.push(Buffer.from('pwd\r\n\x1b[?2004l\r/tmp\r\nalice@dev:~$ '))).toBeUndefined()
  expect(prompt.push(Buffer.from('\r\n' + paste + 'alice@dev:/tmp$ '))).toBe('prompt')
})

it('recognizes the returning prompt after normal tabulated terminal output', () => {
  const listing = 'ls\r\nfile-a\tfile-b\r\n'
  expect(new StartupPrompt().push(Buffer.from(listing + paste + 'alice@dev:~$ '))).toBe('prompt')
})

it('rejects incomplete UTF-8 trailing a semantic prompt until the byte arrives', () => {
  const prompt = new StartupPrompt()
  const extra = Buffer.from('값')
  const first = Buffer.concat([Buffer.from(start + '$ ' + end), extra.subarray(0, 1)])
  expect(prompt.push(first)).toBeUndefined()
  expect(prompt.push(extra.subarray(1))).toBe('manual')
})

it('hands over on excessive output and unterminated escape strings', () => {
  for (const data of ['\x1b]0;' + 'x'.repeat(16_384), 'hello world\r\n'.repeat(100_000)]) {
    expect(new StartupPrompt().push(Buffer.from(data + start + '$ ' + end))).toBe('manual')
  }
})
