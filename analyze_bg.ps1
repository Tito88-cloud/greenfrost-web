param([string]$ImagePath)
Add-Type -AssemblyName System.Drawing

if (!(Test-Path $ImagePath)) {
    Write-Host "File not found: $ImagePath"
    exit 1
}

$bmp = [System.Drawing.Bitmap]::FromFile($ImagePath)
Write-Host "Top-left 10x10 pixels:"
for ($y = 0; $y -lt 10; $y++) {
    $line = ""
    for ($x = 0; $x -lt 10; $x++) {
        $color = $bmp.GetPixel($x, $y)
        $line += "$($color.R),$($color.G),$($color.B) "
    }
    Write-Host $line
}
$bmp.Dispose()
