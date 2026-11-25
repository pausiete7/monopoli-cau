# Fa la llista de les fotos privades (private/fotos.json) perquè el joc les carregui sol.
# Només funciona obrint el joc des d'aquest ordinador (arrencar.bat): la carpeta private no es puja mai a internet.
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$priv = Join-Path $root 'private'
if (-not (Test-Path $priv)) { exit 0 }

$m = [ordered]@{}
$imgs = '\.(png|jpe?g|webp)$'
$fondo = Get-ChildItem $priv -File | Where-Object { $_.BaseName -eq 'fondo' -and $_.Extension -match $imgs } | Select-Object -First 1
if ($fondo) { $m.center = $fondo.Name }
$preso = Get-ChildItem $priv -File | Where-Object { $_.BaseName -eq 'preso' -and $_.Extension -match $imgs } | Select-Object -First 1
if ($preso) { $m.jail = $preso.Name }

$carasDir = Join-Path $priv 'caras'
$caras = @()
if (Test-Path $carasDir) {
  $caras = @(Get-ChildItem $carasDir -File |
    Where-Object { $_.Name -notlike '_*' -and $_.Extension -match $imgs } |
    Sort-Object { $n = $_.BaseName -replace '\D', ''; if ($n) { [int]$n } else { 0 } })
}
$m.faces = @($caras | ForEach-Object { "caras/$($_.Name)" })

# firma: si canvia alguna foto (o se n'afegeix una), el joc les torna a carregar
$parts = @()
foreach ($x in (@($fondo, $preso) + $caras)) { if ($x) { $parts += "$($x.Name):$($x.Length):$($x.LastWriteTimeUtc.Ticks)" } }
$m.sig = $parts -join '|'

$json = $m | ConvertTo-Json -Depth 3
[IO.File]::WriteAllText((Join-Path $priv 'fotos.json'), $json, (New-Object System.Text.UTF8Encoding $false))
