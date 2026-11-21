# Генерация PNG-иконок ПДА без внешних зависимостей (System.Drawing).
# Запуск: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

function New-PdaIcon {
    param(
        [Parameter(Mandatory)][int]$Size,
        [Parameter(Mandatory)][string]$OutputPath,
        [double]$SymbolScale = 1.0,
        [switch]$Maskable,
        [switch]$NoText
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $bgTop = [System.Drawing.Color]::FromArgb(255, 22, 29, 16)
    $bgBottom = [System.Drawing.Color]::FromArgb(255, 6, 9, 5)
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $bgTop, $bgBottom, 90.0)
    $g.FillRectangle($bgBrush, $rect)
    $bgBrush.Dispose()

    # Лёгкая зернистость.
    $rnd = New-Object System.Random(1979)
    $grainLines = [Math]::Max(40, [int]($Size / 3))
    for ($i = 0; $i -lt $grainLines; $i++) {
        $x = $rnd.Next(0, $Size)
        $y = $rnd.Next(0, $Size)
        $alpha = $rnd.Next(4, 15)
        $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb($alpha, 190, 200, 150), 1)
        $g.DrawLine($pen, $x, $y, ($x + $rnd.Next(1, 4)), $y)
        $pen.Dispose()
    }

    # Внутренняя рамка.
    $frameInset = [int]($Size * 0.065)
    $framePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 52, 65, 37), [Math]::Max(1, $Size / 170))
    $g.DrawRectangle($framePen, $frameInset, $frameInset, ($Size - $frameInset * 2 - 1), ($Size - $frameInset * 2 - 1))
    $framePen.Dispose()

    # Углы.
    $amber = [System.Drawing.Color]::FromArgb(255, 227, 167, 47)
    $cornerPen = New-Object System.Drawing.Pen($amber, [Math]::Max(2, $Size / 90))
    $cornerOffset = [int]($Size * 0.105)
    $cornerLen = [int]($Size * 0.075)
    $far = $Size - $cornerOffset

    $g.DrawLine($cornerPen, $cornerOffset, $cornerOffset, ($cornerOffset + $cornerLen), $cornerOffset)
    $g.DrawLine($cornerPen, $cornerOffset, $cornerOffset, $cornerOffset, ($cornerOffset + $cornerLen))
    $g.DrawLine($cornerPen, $far, $cornerOffset, ($far - $cornerLen), $cornerOffset)
    $g.DrawLine($cornerPen, $far, $cornerOffset, $far, ($cornerOffset + $cornerLen))
    $g.DrawLine($cornerPen, $cornerOffset, $far, ($cornerOffset + $cornerLen), $far)
    $g.DrawLine($cornerPen, $cornerOffset, $far, $cornerOffset, ($far - $cornerLen))
    $g.DrawLine($cornerPen, $far, $far, ($far - $cornerLen), $far)
    $g.DrawLine($cornerPen, $far, $far, $far, ($far - $cornerLen))
    $cornerPen.Dispose()

    $cx = $Size / 2.0
    $cy = $Size / 2.0
    $outerR = $Size * 0.285 * $SymbolScale
    $innerR = $Size * 0.112 * $SymbolScale
    $hubR = $Size * 0.072 * $SymbolScale

    # Свечение.
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowR = $outerR * 2.0
    $glowPath.AddEllipse(($cx - $glowR), ($cy - $glowR), ($glowR * 2), ($glowR * 2))
    $glowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
    $glowBrush.CenterColor = [System.Drawing.Color]::FromArgb(38, 227, 167, 47)
    $glowBrush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 227, 167, 47))
    $g.FillPath($glowBrush, $glowPath)
    $glowBrush.Dispose()
    $glowPath.Dispose()

    # Знак радиации.
    $symbolPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    foreach ($start in @(240, 0, 120)) {
        $bladePath = New-Object System.Drawing.Drawing2D.GraphicsPath
        $outerRect = New-Object System.Drawing.RectangleF(($cx - $outerR), ($cy - $outerR), ($outerR * 2), ($outerR * 2))
        $innerRect = New-Object System.Drawing.RectangleF(($cx - $innerR), ($cy - $innerR), ($innerR * 2), ($innerR * 2))
        $bladePath.AddArc($outerRect, $start, 60)
        $endAngle = $start + 60
        $bladePath.AddArc($innerRect, [float]$endAngle, [float](-60))
        $bladePath.CloseFigure()
        $symbolPath.AddPath($bladePath, $false)
        $bladePath.Dispose()
    }
    $symbolBrush = New-Object System.Drawing.SolidBrush($amber)
    $g.FillPath($symbolBrush, $symbolPath)
    $symbolBrush.Dispose()
    $symbolPath.Dispose()

    $hubBrush = New-Object System.Drawing.SolidBrush($amber)
    $g.FillEllipse($hubBrush, [float]($cx - $hubR), [float]($cy - $hubR), [float]($hubR * 2), [float]($hubR * 2))
    $hubBrush.Dispose()

    # Орбита.
    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 227, 167, 47), [Math]::Max(1, $Size / 300))
    $ringR = $outerR * 1.28
    $g.DrawEllipse($ringPen, [float]($cx - $ringR), [float]($cy - $ringR), [float]($ringR * 2), [float]($ringR * 2))
    $ringPen.Dispose()

    if (-not $NoText) {
        $fontSize = [Math]::Max(7, $Size * 0.033)
        $font = New-Object System.Drawing.Font('Consolas', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 227, 167, 47))
        $format = New-Object System.Drawing.StringFormat
        $format.Alignment = [System.Drawing.StringAlignment]::Center
        $textRect = New-Object System.Drawing.RectangleF(0, [float]($Size * 0.775), $Size, [float]($Size * 0.13))
        $g.DrawString('ПДА-2М', $font, $textBrush, $textRect, $format)
        $format.Dispose()
        $textBrush.Dispose()
        $font.Dispose()
    }

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

New-PdaIcon -Size 512 -OutputPath (Join-Path $outDir 'icon-512.png')
New-PdaIcon -Size 192 -OutputPath (Join-Path $outDir 'icon-192.png')
New-PdaIcon -Size 512 -OutputPath (Join-Path $outDir 'icon-maskable-512.png') -SymbolScale 0.92 -Maskable -NoText
New-PdaIcon -Size 180 -OutputPath (Join-Path $outDir 'apple-touch-icon.png') -NoText

Write-Host "Иконки созданы в $outDir" -ForegroundColor Green
