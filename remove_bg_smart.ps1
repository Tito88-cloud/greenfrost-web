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

# Get the background color from the top-left pixel
$bgColor = $bmp.GetPixel(0, 0)
$tolerance = 30

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
        $color = $bmp.GetPixel($x, $y)
        
        $rDiff = [Math]::Abs($color.R - $bgColor.R)
        $gDiff = [Math]::Abs($color.G - $bgColor.G)
        $bDiff = [Math]::Abs($color.B - $bgColor.B)
        
        if ($rDiff -le $tolerance -and $gDiff -le $tolerance -and $bDiff -le $tolerance) {
            $bmp2.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            $bmp2.SetPixel($x, $y, $color)
        }
    }
}

$bmp.Dispose()
$bmp2.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp2.Dispose()

Write-Host "Smart transparent image saved to $OutPath"
