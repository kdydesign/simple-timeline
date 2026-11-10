import 'reflect-metadata'
import { createHash, webcrypto, X509Certificate } from 'node:crypto'
import { BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension, KeyUsageFlags, KeyUsagesExtension, SubjectAlternativeNameExtension, X509CertificateGenerator } from '@peculiar/x509'
import { validateSharingIdentity } from '../../domain/sharing'

export interface HostIdentity {
  hostId: string
  serverName: string
  certificate: string
  privateKey: string
  pin: string
}
export function certificatePin(certificate: string | Buffer): string {
  return createHash('sha256').update(new X509Certificate(certificate).raw).digest('hex')
}
export function hostServerName(hostId: string): string {
  return `planrail-${validateSharingIdentity(hostId)}.local`
}
/** Generate once per profile; callers persist both PEM secrets using protected storage. */
export async function createHostIdentity(hostId: string): Promise<HostIdentity> {
  const serverName = hostServerName(hostId)
  const crypto = webcrypto as unknown as Crypto
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: webcrypto.getRandomValues(new Uint8Array(16)).reduce((s, n) => s + n.toString(16).padStart(2, '0'), ''),
    name: `CN=${serverName}`,
    notBefore: new Date(Date.now() - 86400000),
    notAfter: new Date(Date.now() + 10 * 365 * 86400000),
    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' }, keys,
    extensions: [new BasicConstraintsExtension(false, undefined, true), new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true), new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]), new SubjectAlternativeNameExtension([{ type: 'dns', value: serverName }])],
  }, crypto)
  const certificatePem = certificate.toString('pem')
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey))
  const privateKey = `-----BEGIN PRIVATE KEY-----\n${der.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`
  return { hostId, serverName, certificate: certificatePem, privateKey, pin: certificatePin(certificatePem) }
}
