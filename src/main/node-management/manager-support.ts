import type { NodeCapabilities, NodeConflict } from '../../shared/node-management'

// SHA-256 of installed files from the official nvm-windows/nvm release assets.
// 1.x nvm-noinstall.zip and v2.0.1 nvm-2.0.1-x64-setup.exe.
export const classicDigests = {
  '1.1.10': '6eef8b67aeefcb060c98b1e4925e5b23e6097546b73f564c5839f8dcb2dfbc3b',
  '1.1.11': 'a49764cb5cae51d0a31f7bbeda22bc6eab4b2952f2638d543bb38877a6670791',
  '1.2.2': '665b0b033e88098367381e929b71cfc96dc4058a3cb6fef760a0ccc9a883dd13',
} as const
export function usesOfficialNodeZip(version: string) {
  return version === '1.1.10' || version === '1.1.11'
}
export const modernDigest = '0a8b88433fde1cbf48a03b7589b744361b20b4401a3be167614f82c62d26b29e'
export const legacyHelpers = {
  'elevate.cmd': '792d6a485d26b3ae1c926d1d4915e5eaf9a40113afd623212d1a9591e56bb1d5',
  'elevate.vbs': '3219b67d6c49d02b832026d13ece959c85d64690326d6b3f10923790c8a5f130',
}
export const modernHelpers = {
  '.shim\\node.exe': '79c7fb995b45030f3366c4552085d1f2b389f0f46ac829d1932413ec2c3de26d',
  'utils\\proxy.exe': 'fb4256ea5f2f7a3cfceeed9f7bf889a031ad04e594f6e4c5a9851824f561af90',
  'utils\\reshim.exe': '96b991812cf342833a225de9f5abe10a3f067bc5a898b30c6538f29530521b8d',
  'utils\\sync.exe': '26a564b61887676e55023e4f8476750988d425968c953bcc7126a14f035daf78',
}
export const availability = (reason: string | null) => ({ available: reason === null, reason })
export function capabilities(reason: string | null): NodeCapabilities {
  return { list: availability(reason), install: availability(reason), use: availability(reason) }
}

/** Classify the setting locally. Only fixed diagnostics may enter discovery state. */
export function proxyConflict(raw: unknown, family: 'classic' | 'modern', authenticated = false): NodeConflict | null {
  const invalid: NodeConflict = { code: 'proxy', path: null, message: 'nvm 프록시 설정을 확인해 주세요. NodeRail은 HTTP(S) 서버 주소와 포트 방식을 지원합니다.' }
  if (authenticated || (typeof raw === 'string' && /^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/?#]*@/i.test(raw))) {
    return { code: 'proxy', path: null, message: 'NodeRail은 인증 정보가 없는 HTTP(S) 프록시만 지원합니다. 사용 가능한 연결 방식을 사내 네트워크 관리자에게 확인해 주세요.' }
  }
  if (raw === undefined || raw === '' || (family === 'classic' && raw === 'none')) return null
  if (typeof raw !== 'string') return invalid
  const endpoint = /^(https?:\/\/)?(?:[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)*\.?|\[[\da-f:.]+\])(?::(\d+))?\/?$/iu.exec(raw)
  if (!endpoint) return invalid
  const [, scheme, port] = endpoint
  // Both CLIs prepend http:// to bare host:port. Classic checks the first
  // four bytes for "http" before adding it, even for a scheme-less hostname.
  if (!scheme && (!port || (family === 'classic' && (Buffer.byteLength(raw) < 4 || /^http/i.test(raw))))) return invalid
  if (port && Number(port) === 0) return invalid
  return URL.canParse(scheme ? raw : 'http://' + raw) ? null : invalid
}
