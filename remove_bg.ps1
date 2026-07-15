param([string]$ImagePath, [string]$OutPath)
Add-Type -AssemblyName System.Drawing

if (!(Test-Path $ImagePath)) {
    Write-Host "File not found: $ImagePath"
    exit 1
}

$bmp = [System.Drawing.Bitmap]::FromFile($ImagePath)
$bmp2 = new-object System.Drawing.Bitmap $bmp.Width, $bmp.Height
$bmp2.SetResolution($bmp.HorizontalResolution, $bmp.VerticalResolution)

$gfx = [System.Drawing.Graphics]::FromImage($bmp2)
$gfx.Clear([System.Drawing.Color]::Transparent)

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $color = $bmp.GetPixel($x, $y)
        if ($color.R -gt 230 -and $color.G -gt 230 -and $color.B -gt 230) {
            $bmp2.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            $bmp2.SetPixel($x, $y, $color)
        }
    }
}

$bmp.Dispose()
$bmp2.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp2.Dispose()

Write-Host "Transparent image saved to $OutPath"
