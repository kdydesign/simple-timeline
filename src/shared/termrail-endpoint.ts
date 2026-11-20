// URL's IPv6 parser is available in both Chromium and the Electron main process.
// Only pass literal address characters to it so it cannot reinterpret a URL as a host.
function validIpv6(value: string) {
  const address = /^([a-f0-9:.]+)(?:%[a-z0-9_.-]+)?$/i.exec(value)
  return !!address && URL.canParse('http://[' + address[1] + ']/')
}

export function hostError(value: string): string {
  if (!value) return '호스트 이름 또는 IP 주소를 입력하세요.'
  if (value.length > 253) return '호스트는 253자 이내로 입력하세요.'
  if (/[\s\x00-\x1f\x7f/@?#\\]/u.test(value)) return 'URL이나 경로 없이 호스트 이름 또는 IP 주소만 입력하세요.'
  if (value.includes(':')) {
    if (validIpv6(value)) return ''
    if (/^(?:[^:]+|\[[^\]]+\]):\d+$/.test(value)) return '포트 번호는 오른쪽 포트 칸에 입력하세요.'
    return '올바른 IPv6 주소를 대괄호 없이 입력하세요.'
  }
  const dns = value.replace(/\.$/, '')
  if (/^[\d.]+$/.test(dns)) {
    const parts = dns.split('.')
    return parts.length === 4 && parts.every(part => /^(?:0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
      ? '' : 'IPv4 주소는 0부터 255 사이의 숫자 네 개로 입력하세요.'
  }
  if (!dns.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))
    return '호스트 이름에는 영문, 숫자, 점과 하이픈을 사용할 수 있습니다.'
  return ''
}

export function portError(value: string): string {
  if (!/^\d+$/.test(value)) return '포트 번호를 정수로 입력하세요.'
  return Number(value) >= 1 && Number(value) <= 65535 ? '' : '포트는 1부터 65535 사이로 입력하세요.'
}
