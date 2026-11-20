import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ssh2 1.17 truncates Ed25519 public keys that begin with a zero byte when generating host keys.
export function createTestSshHostKey(): Buffer {
  const directory = mkdtempSync(join(tmpdir(), 'workrail-ssh-key-'))
  const path = join(directory, 'host')
  try {
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'workrail-test', '-f', path], { windowsHide: true })
    return readFileSync(path)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
