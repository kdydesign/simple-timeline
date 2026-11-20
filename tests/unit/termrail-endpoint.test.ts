import {expect, it} from 'vitest'
import {hostError, portError} from '../../src/shared/termrail-endpoint'
import {readLibrary} from '../../src/renderer/termrail/layout'

it('accepts DNS labels, IPv4 and literal IPv6 including compressed and scoped addresses', () => {
  for (const host of ['dev', 'dev-2.example.', '127.0.0.1', '255.255.255.255', '::', '::1', '2001:db8::1:22',
    'fe80::1%eth0', '::ffff:192.0.2.128']) expect(hostError(host), host).toBe('')
})

it('distinguishes invalid hosts, URLs, ports embedded in hosts and incomplete IP literals', () => {
  for (const host of ['', ':', 'dev.example:22', '[2001:db8::1]:22', 'ssh://dev.example', 'user@host',
    'dev/path', 'dev test', '-dev.test', 'dev-.test', 'dev..test', 'dev_.test', '999.1.2.3', '127.1', '1:::1',
    '1.2.3.004', 'a'.repeat(64) + '.example', 'fe80::1%' + '1'.repeat(253)]) expect(hostError(host), host).not.toBe('')
  expect(hostError('dev:2222')).toMatch(/포트/)
  expect(hostError('ssh://dev/')).toMatch(/URL/)
  expect(hostError('2001:db8:::1')).toMatch(/IPv6/)
  expect(hostError('300.0.0.1')).toMatch(/IPv4/)
})

it('only accepts decimal integer port numbers in the SSH TCP port range', () => {
  for (const port of ['1', '22', '65535']) expect(portError(port)).toBe('')
  for (const port of ['', '0', '65536', '-1', '2.5', '1e3', '0x16']) expect(portError(port)).not.toBe('')
})

it('loads legacy profile endpoints and saved layouts together for repair', () => {
  const library = {profiles:[
    {id:'old', name:'기존 서버', host:'old:22', port:22},
    {id:'current', name:'새 서버', host:'dev.test', port:22},
  ], layouts:[{name:'기존 배치',layout:{tabs:[{titleProfileId:'old', title:'기존 서버',tree:{kind:'pane',pane:'old'}}],
    selected:0,windows:[]}}]}
  expect(readLibrary(JSON.stringify(library))).toEqual(library)
})
