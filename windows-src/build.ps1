param(
    [Parameter(Mandatory)]
    [string] $OutputDirectory,
    [string] $Ref = 'HEAD'
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$destination = [IO.Path]::GetFullPath($OutputDirectory)
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$version = ((git -C $repo show "${Ref}:package.json") -join "`n" | ConvertFrom-Json).version
if ($LASTEXITCODE -or $version -notmatch '^\d+\.\d+\.\d+$') { throw 'Versão inválida.' }
New-Item -ItemType Directory -Force $destination | Out-Null
$assets = Join-Path ([IO.Path]::GetTempPath()) ("ignispyro-" + [guid]::NewGuid().ToString('N') + '.zip')
$output = Join-Path $destination "Fogo-Tecnico-IgnisPyro-Windows-v$version.exe"
try {
    git -C $repo archive --format=zip -o $assets "${Ref}:app"
    if ($LASTEXITCODE) { throw 'Não foi possível empacotar a aplicação.' }
    & $compiler /nologo /codepage:65001 /target:exe /optimize+ /platform:anycpu /reference:System.IO.Compression.dll "/resource:$assets,app.zip" "/out:$output" (Join-Path $PSScriptRoot 'Launcher.cs')
    if ($LASTEXITCODE) { throw 'A compilação para Windows falhou.' }
    Get-FileHash -LiteralPath $output -Algorithm SHA256
} finally {
    if (Test-Path -LiteralPath $assets) { Remove-Item -LiteralPath $assets }
}
