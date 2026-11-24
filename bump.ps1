# Posa un número de versió nou a tots els imports perquè el navegador no barregi fitxers vells i nous.
# Ús: powershell -File bump.ps1
$v = [DateTimeOffset]::Now.ToUnixTimeSeconds()
$utf8 = New-Object Text.UTF8Encoding $false
Get-ChildItem js\*.js | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName, $utf8)
  $t = [Regex]::Replace($t, "from '\./([\w-]+)\.js(\?v=\d*)?'", "from './`$1.js?v=$v'")
  [IO.File]::WriteAllText($_.FullName, $t, $utf8)
}
$f = 'index.html'
$t = [IO.File]::ReadAllText($f, $utf8)
$t = [Regex]::Replace($t, '\?v=\d*"', "?v=$v`"")
[IO.File]::WriteAllText($f, $t, $utf8)
Write-Output "versio $v"
