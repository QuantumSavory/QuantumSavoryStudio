$ErrorActionPreference = "Stop"
$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
& julia --startup-file=no "--project=$AppRoot" (Join-Path $PSScriptRoot "server.jl") @args
exit $LASTEXITCODE
