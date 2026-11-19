import { X509Certificate } from 'node:crypto'

const defaultSigners = ['OpenJS Foundation', 'Node.js Foundation', 'Author Software Inc.']
export interface NodeSigningPolicy {
  signers: string[]
  thumbprints: string[]
  cached: boolean
}

function entries(value: unknown): string[] | null {
  if (value === undefined) return []
  const items = typeof value === 'string' ? value.split(',') : value
  if (!Array.isArray(items) || !items.every(item => typeof item === 'string')) return null
  return items.map(item => item.trim()).filter(Boolean)
}

export function nodeSigningPolicy(settings: Record<string, unknown>): NodeSigningPolicy | null {
  const signers = entries(settings.AllowedSigners)
  const pins = entries(settings.AllowedThumbprints)
  const mode = settings.AuthenticodeRevocation ?? 'online'
  if (!signers || !pins || typeof mode !== 'string' || ['disabled', 'none', 'off', '0'].includes(mode.trim().toLowerCase())) return null
  if (signers.some(s => !defaultSigners.some(allowed => allowed.toLowerCase() === s.toLowerCase()))) return null
  const thumbprints = pins.map(value => value.replace(/[ :\-]/g, '').toUpperCase())
  if (thumbprints.some(pin => !/^[0-9A-F]{40}$/.test(pin))) return null
  return {
    signers: signers.length ? signers : defaultSigners, thumbprints,
    cached: ['cached', 'cache', 'cache_only', 'cache-only'].includes(mode.trim().toLowerCase()),
  }
}

// Verify the embedded Authenticode signature with the same whole-chain revocation
// requirement as nvm's seed operation. A cached-only request must never go online.
export function nodeSignatureCheck(path: string, policy: NodeSigningPolicy) {
  const literal = "'" + path.replaceAll("'", "''") + "'"
  return `
$ErrorActionPreference = 'Stop'
$env:TEMP = [IO.Path]::Combine([Environment]::GetFolderPath('LocalApplicationData'), 'Temp')
$env:TMP = $env:TEMP
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WorkRailNodeTrust {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  private struct FileInfo {
    public uint size;
    [MarshalAs(UnmanagedType.LPWStr)] public string path;
    public IntPtr handle, subject;
  }
  [StructLayout(LayoutKind.Sequential)]
  private struct TrustData {
    public uint size;
    public IntPtr callbacks, client;
    public uint ui, revoke, choice;
    public IntPtr file;
    public uint action;
    public IntPtr state, url;
    public uint flags, context;
    public IntPtr signature;
  }
  [DllImport("wintrust.dll", ExactSpelling=true)]
  private static extern int WinVerifyTrust(IntPtr hwnd, ref Guid action, ref TrustData data);
  public static bool Verify(string path, bool cached) {
    var file = new FileInfo { size = (uint)Marshal.SizeOf(typeof(FileInfo)), path = path };
    var pointer = Marshal.AllocHGlobal((int)file.size);
    try {
      Marshal.StructureToPtr(file, pointer, false);
      var trust = new TrustData {
        size = (uint)Marshal.SizeOf(typeof(TrustData)), ui = 2, revoke = 1, choice = 1,
        file = pointer, flags = cached ? 0x1100u : 0x100u
      };
      var action = new Guid("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");
      return WinVerifyTrust(IntPtr.Zero, ref action, ref trust) == 0;
    } finally { Marshal.DestroyStructure(pointer, typeof(FileInfo)); Marshal.FreeHGlobal(pointer); }
  }
}
'@
$file = [IO.File]::Open(${literal}, 'Open', 'Read', 'Read')
try {
  if ([WorkRailNodeTrust]::Verify(${literal}, ${policy.cached ? '$true' : '$false'})) {
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate]::CreateFromSignedFile(${literal})
    [Console]::WriteLine([Convert]::ToBase64String($certificate.GetRawCertData()))
  }
} finally { $file.Dispose() }
`
}

export function allowedNodeSigner(certificate: string, policy: NodeSigningPolicy) {
  if (!certificate) return false
  const signer = new X509Certificate(Buffer.from(certificate, 'base64'))
  const name = signer.subject.split('\n').find(part => part.startsWith('O='))?.slice(2)
  return !!name && policy.signers.some(org => org.toLowerCase() === name.toLowerCase())
    && (!policy.thumbprints.length || policy.thumbprints.includes(signer.fingerprint.replaceAll(':', '')))
}
