import { isNodeVersion, type NodeCapabilities, type NodeManagementState } from '../../shared/node-management'
import { availability, capabilities } from './manager-support'

// The login shell supplies the default user's PATH and NODENV_ROOT. Resolve candidates
// first, then use system utilities for all ownership and mount checks before execution.
const context = String.raw`
set -eu
manager=$(command -v nodenv || true)
builder=$(command -v node-build || true)
node_path=$(command -v node || command -v node.exe || true)
original_path=$PATH
PATH=/usr/bin:/bin
export PATH LC_ALL=C
unset NODENV_VERSION NODENV_DIR BASH_ENV ENV CDPATH
cd "$HOME"
uid=$(id -u)
user=$(id -un)
root=$(printenv NODENV_ROOT || true)
[ -n "$root" ] || root="$HOME/.nodenv"
[ -n "$manager" ] || manager="$root/bin/nodenv"
[ -n "$builder" ] || builder="$root/plugins/node-build/bin/node-build"
safe_path() {
  case "$1" in /*) ;; *) return 1;; esac
  case "$1" in *:*|*/../*|*/./*|*/..|*/.) return 1;; esac
  for p in "$1" "$(realpath -e -- "$1")"; do
    case "$p" in ''|/mnt/[a-zA-Z]/*|*.exe) return 1;; esac
    case "$(stat -f -L -c %T -- "$p")" in 9p|drvfs|fuseblk) return 1;; esac
    while [ "$p" != / ]; do
      owner=$(stat -Lc %u -- "$p") || return 1
      [ "$owner" = 0 ] || [ "$owner" = "$uid" ] || return 1
      mode=$(stat -Lc %a -- "$p") || return 1
      if [ "$((0$mode & 022))" -ne 0 ]; then
        [ "$p" = /tmp ] && [ "$owner" = 0 ] && [ -k "$p" ] || return 1
      fi
      p=$(dirname -- "$p")
    done
  done
}
safe_tree() {
  safe_path "$1" || return 1
  unsafe=$(find -L "$1" -xdev \( \( ! -uid 0 ! -uid "$uid" \) -o -perm /022 \) -print -quit) || return 1
  [ -z "$unsafe" ]
}
ready_manager() {
  [ -x "$manager" ] && [ -f "$manager" ] && safe_path "$manager" && safe_path "$root" || return 1
  libexec=$(dirname -- "$(realpath -e -- "$manager")")
  for path in "$libexec"/nodenv-*; do
    [ -e "$path" ] || continue
    # System package managers can share /usr/bin with unrelated programs.
    safe_path "$path" || return 1
  done
  for path in "$root"/plugins/*/bin "$root"/plugins/*/etc/nodenv.d "$root/nodenv.d" "$(dirname -- "$libexec")/nodenv.d" /usr/etc/nodenv.d /usr/local/etc/nodenv.d /etc/nodenv.d /usr/lib/nodenv/hooks; do
    [ -e "$path" ] || continue
    safe_tree "$path" || return 1
  done
  export NODENV_ROOT="$root"
  # Drop relative, Windows-mounted and publicly writable lookup directories.
  oldifs=$IFS; IFS=:
  set -f
  clean=
  for dir in $original_path; do
    [ -d "$dir" ] && safe_path "$dir" || continue
    clean="$clean:$dir"
  done
  for path in $(printenv NODENV_HOOK_PATH || true); do
    [ -d "$path" ] && safe_tree "$path" || return 1
  done
  IFS=$oldifs
  set +f
  PATH="/usr/bin:/bin:$(dirname -- "$manager")$clean"; export PATH
  [ "$("$manager" root)" = "$root" ]
}
valid_global_path() {
  [ ! -L "$root/version" ] && { [ ! -e "$root/version" ] || safe_path "$root/version"; }
}
ready_builder() {
  [ -f "$builder" ] && [ -x "$builder" ] && safe_path "$builder" || return 1
  defs_root=$(printenv NODE_BUILD_ROOT || dirname -- "$(dirname -- "$(realpath -e -- "$builder")")")
  defs="$defs_root/share/node-build"
  [ ! -e "$defs" ] || safe_tree "$defs" || return 1
  oldifs=$IFS; IFS=:
  set -f
  for path in $(printenv NODE_BUILD_DEFINITIONS || true); do
    [ -d "$path" ] && safe_tree "$path" || return 1
  done
  set +f
  IFS=$oldifs
}
`

export const probeScript = context + String.raw`
field() { printf '%s\0%s\0' "$1" "$2"; }
printf 'WORKRAIL_PROBE_V1\0'
field user "$user"
field arch "$(uname -m)"
field manager "$manager"
field root "$root"
if [ ! -e "$manager" ]; then field status missing; exit; fi
if ! ready_manager; then field status unsafe; exit; fi
version=$("$manager" --version) || { field status unsafe; exit; }
field managerVersion "$version"
field status ready
global=$("$manager" global) && field global "$global"
if versions=$("$manager" versions --bare); then
  field listed yes
  set -f
  for v in $versions; do
    case "$v" in ''|*[!0-9.]* ) continue;; esac
    [ ! -e "$root/versions/$v/.workrail-installing" ] && [ -x "$root/versions/$v/bin/node" ] && field installed "$v"
  done
  set +f
fi
if valid_global_path && [ -w "$root" ] && { [ ! -e "$root/version" ] || [ -w "$root/version" ]; }; then field writable yes; fi
case "$node_path" in ""|"$root/shims/node") ;; *) field conflict "$node_path";; esac
if ready_builder && definitions=$("$builder" --definitions); then
  field builder "$builder"
  field definitions "$definitions"
fi
if command -v make >/dev/null && command -v c++ >/dev/null && command -v python3 >/dev/null; then field buildTools yes; fi
`

export const changeScript = context + String.raw`
kind=$1; v=$2
[ "$user" = "$3" ] && [ "$manager" = "$4" ] && [ "$root" = "$5" ] || exit 71
case "$v" in ''|*[!0-9.]*) exit 72;; esac
ready_manager && valid_global_path || exit 71
case "$node_path" in ""|"$root/shims/node") ;; *) exit 71;; esac
# Coordinate WorkRail processes using the same Linux user root.
exec 9<"$root"
flock -n 9 || { echo '다른 WorkRail Node 작업이 진행 중입니다.' >&2; exit 73; }
case "$kind" in
  use)
    binary="$root/versions/$v/bin/node"
    [ ! -e "$root/versions/$v/.workrail-installing" ] && [ -x "$binary" ] && safe_path "$binary" && [ "$("$binary" --version)" = "v$v" ] || exit 71
    exec "$manager" global "$v";;
  install)
    [ "$builder" = "$6" ] && ready_builder || exit 71
    "$builder" --definitions | grep -Fx -- "$v" >/dev/null || exit 71
    versions="$root/versions"
    [ ! -L "$versions" ] || exit 71
    mkdir -p -- "$versions"; safe_path "$versions" || exit 71
    prefix="$versions/$v"
    marker="$prefix/.workrail-installing"
    if [ -e "$prefix" ] || [ -L "$prefix" ]; then
      [ ! -L "$prefix" ] && [ -f "$marker" ] && [ ! -L "$marker" ] && safe_path "$marker" || exit 71
      [ "$(cat "$marker")" = "WorkRail $(stat -c %d:%i "$prefix") $v" ] || exit 71
      archive=$(mktemp -d -- "$root/.workrail-incomplete.XXXXXXXX")
      mv -T -- "$prefix" "$archive/$v"
      echo "이전 미완료 빌드 보관: $archive/$v" >&2
    fi
    # Reserve the real compile prefix with its inode marker already present.
    # A killed build stays hidden from inventory and can be retried safely.
    stage=$(mktemp -d -- "$versions/.workrail-start.XXXXXXXX")
    printf 'WorkRail %s %s\n' "$(stat -c %d:%i "$stage")" "$v" > "$stage/.workrail-installing"
    mv -nT -- "$stage" "$prefix"
    [ ! -e "$stage" ] || { rm -- "$stage/.workrail-installing"; rmdir -- "$stage"; exit 71; }
    "$builder" -v "$v" "$prefix"
    binary="$prefix/bin/node"
    [ -x "$binary" ] && safe_path "$binary" && [ "$("$binary" --version)" = "v$v" ] || exit 74
    rm -- "$marker"
    "$manager" rehash;;
  *) exit 72;;
esac
`

// Launched by setsid. Only the private stdin belonging to this invocation
// controls its group. A closed host pipe also stops an orphaned guest build.
export const superviseScript = String.raw`
exec 3<&0
leader=$$
(
  IFS= read -r request || request=closed
  case "$request" in cancel|closed)
    printf '%s\n' WORKRAIL_CANCEL_ACK >&2
    /bin/kill -KILL -- "-$leader";;
  esac
) <&3 &
watcher=$!
"$@" </dev/null 3<&-
result=$?
kill "$watcher" 2>/dev/null || true
wait "$watcher" 2>/dev/null || true
exit "$result"
`

export interface WslInspection {
  user: string
  arch: string
  root: string
  builder: string | null
  definitions: string[]
  buildTools: boolean
  global: string | null
  manager: NodeManagementState['manager']
  capabilities: NodeCapabilities
  installedVersions: string[]
  activeVersion: string | null
  conflicts: NodeManagementState['conflicts']
}

export const missingBuilder = 'node-build를 확인해 주세요. 설치 안내 https://github.com/nodenv/node-build#installation'
export const missingBuildTools = '소스 빌드에는 make, C++ 컴파일러와 Python 3가 필요합니다. 배포판의 빌드 도구를 확인해 주세요.'

export function parseGuestProbe(output: string): WslInspection {
  const boundary = 'WORKRAIL_PROBE_V1\0'
  const offset = output.indexOf(boundary)
  if (offset < 0) throw Error('Missing guest inspection')
  const tokens = output.slice(offset + boundary.length).split('\0')
  if (tokens.pop() !== '' || tokens.length % 2) throw Error('Incomplete guest inspection')
  const fields = new Map<string, string>()
  const installed = new Set<string>()
  for (let i = 0; i < tokens.length; i += 2) {
    if (tokens[i] === 'installed' && isNodeVersion(tokens[i + 1])) installed.add(tokens[i + 1])
    else fields.set(tokens[i], tokens[i + 1])
  }
  const user = fields.get('user'), arch = fields.get('arch'), root = fields.get('root'), path = fields.get('manager')
  const status = fields.get('status'), global = fields.get('global') ?? null
  if (!user || !arch || !root || !path || !['ready', 'missing', 'unsafe'].includes(status ?? '')) throw Error('Invalid guest inspection')
  const version = /^nodenv (\d+(?:\.\d+)+(?:[-+.][\w.-]+)?)$/.exec(fields.get('managerVersion')?.trim() ?? '')?.[1] ?? null
  const ready = status === 'ready' && !!version
  const reason = status === 'missing' ? 'nodenv 설치 또는 PATH 초기화를 확인해 주세요. 설치 안내 https://github.com/nodenv/nodenv#installation'
    : 'Linux nodenv 실행 경로·버전과 파일 소유권 및 쓰기 권한을 확인해 주세요.'
  const listed = fields.has('listed'), conflict = fields.get('conflict')
  const listReason = listed ? null : 'nodenv versions로 설치 목록을 확인하지 못했습니다.'
  const mutationReason = listReason ?? (global === null ? 'nodenv global 기본 버전을 읽을 수 없습니다.' : conflict ? 'Linux nodenv shims 경로를 PATH에서 우선하도록 초기화해 주세요.'
    : !fields.has('writable') ? '선택 사용자의 nodenv 설정 및 쓰기 권한을 확인해 주세요.' : null)
  const builder = fields.get('builder') ?? null
  return {
    user, arch: ({ x86_64: 'x64', aarch64: 'arm64', i686: 'x86' } as Record<string,string>)[arch] ?? arch,
    root, builder, definitions: (fields.get('definitions') ?? '').split(/\s+/).filter(isNodeVersion), buildTools: fields.has('buildTools'),
    global, activeVersion: isNodeVersion(global) ? global : null, installedVersions: [...installed],
    manager: { kind: 'nodenv', path, status: ready ? 'ready' : status === 'missing' ? 'missing' : 'error', version },
    conflicts: conflict ? [{ code: 'path-priority', path: conflict, message: '다른 Node가 PATH에서 nodenv보다 먼저 발견되었습니다.' }] : [],
    capabilities: ready ? { list: availability(listReason), use: availability(mutationReason), install: availability(mutationReason ?? (builder ? null : missingBuilder)) } : capabilities(reason),
  }
}
