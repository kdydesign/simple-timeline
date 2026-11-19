// Windows PowerShell 5.1's ConvertTo-Json uses this .NET Framework serializer.
// Registry snapshots contain only primitive values, arrays and string-keyed maps.
// Loading its strongly named framework type avoids Utility module discovery on a new profile.
export const registryJson = `
$serializerType = [Type]::GetType('System.Web.Script.Serialization.JavaScriptSerializer, System.Web.Extensions, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35', $true)
$serializer = [Activator]::CreateInstance($serializerType)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
`
