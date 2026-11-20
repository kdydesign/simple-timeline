// Bound both parsing time and whitespace growth independently of syntax highlighting.
const maxSource = 256 * 1024
const maxFormatted = 1024 * 1024

export function formatResponseJson(source:string): {text:string, error:string} {
  const tooLarge = {text:source, error:'정렬할 수 있는 크기를 넘었습니다.'}
  if (source.length > maxSource) return tooLarge
  try { JSON.parse(source) }
  catch { return {text:source, error:'JSON 문법을 확인하세요.'} }

  // JSON.parse validates grammar. Copy tokens from the source to preserve duplicates,
  // key order, numeric precision/notation and string escapes.
  const tokens = /"(?:\\[\s\S]|[^"\\])*"|[^\s"{}\[\],:]+|[{}\[\],:]/g
  let depth = 0
  let previous = ''
  let output = ''
  for (const [token] of source.matchAll(tokens)) {
    const closing = token === '}' || token === ']'
    const afterOpen = previous === '{' || previous === '['
    if (closing) depth--
    const newLine = closing ? !afterOpen : afterOpen || previous === ','
    const padding = newLine ? 1 + depth * 2 : previous === ':' ? 1 : 0
    if (output.length + padding + token.length > maxFormatted) return tooLarge
    if (newLine) output += '\n' + '  '.repeat(depth)
    else if (previous === ':') output += ' '
    output += token
    if (token === '{' || token === '[') depth++
    previous = token
  }
  return {text:output,error:''}
}
