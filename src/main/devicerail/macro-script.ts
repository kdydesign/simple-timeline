import {randomUUID} from 'node:crypto'

// Ask the target's POSIX shell to recognize complete commands. The closing brace
// stays unmatched while reading an unfinished quote, here-document or compound command.
// Only the final shell executes the source. Every group shares its cwd and variables.
export function macroScript(commands: string) {
  const delimiter = 'WORKRAIL_' + randomUUID()
  return `{
  pending=
  while IFS= read -r line; do
    pending="$pending$line
"
    if printf '{\\n:\\n%s}\\n' "$pending" | sh -n 2>/dev/null; then
      printf '{\\n:\\n%s} </dev/null\\n' "$pending"
      printf '%s\\n' 'case $? in 0) ;; *) exit "$?" ;; esac'
      pending=
    fi
  done
  if [ -n "$pending" ]; then
    printf '{\\n:\\n%s}\\n' "$pending" | sh -n >&2 || :
    printf '%s\\n' 'exit 2'
  fi
} <<'${delimiter}' | sh -se
${commands.replace(/\r\n/g, '\n')}
${delimiter}
`
}
