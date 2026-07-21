param([string]$ImagePath, [string]$OutPath)
Add-Type -AssemblyName System.Drawing

if (!(Test-Path $ImagePath)) {
    Write-Host "File not found: $ImagePath"
    exit 1
}

$bmp = [System.Drawing.Bitmap]::FromFile($ImagePath)
$padX = [int]($bmp.Width * 0.25)
$padY = [int]($bmp.Height * 0.25)

$newWidth = $bmp.Width + ($padX * 2)
$newHeight = $bmp.Height + ($padY * 2)

$bmp2 = new-object System.Drawing.Bitmap $newWidth, $newHeight
$bmp2.SetResolution($bmp.HorizontalResolution, $bmp.VerticalResolution)

$gfx = [System.Drawing.Graphics]::FromImage($bmp2)
# Rellenar con blanco
$gfx.Clear([System.Drawing.Color]::White)
# Dibujar la imagen original en el centro
$gfx.DrawImage($bmp, $padX, $padY, $bmp.Width, $bmp.Height)

$bmp.Dispose()
$bmp2.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp2.Dispose()

Write-Host "Padded image saved to $OutPath"
