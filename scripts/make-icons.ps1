# 앱 아이콘 생성: brand/app-icon-original.png (흰 배경의 오리 캐릭터) → public/ 아이콘들
#   powershell -ExecutionPolicy Bypass -File scripts/make-icons.ps1
# 1) 테두리에서 시작해 '밝은 픽셀'만 따라 번지는 영역(배경 · 그림자 · 윤곽선 바깥 안티앨리어싱)을
#    "검정 + 알파(255-밝기)" 로 바꿔 투명 배경을 만든다. 윤곽선 안쪽의 흰 몸통은 그대로 불투명.
# 2) 여백을 잘라 duck.png 로 저장하고, 하늘색 배경의 정사각 아이콘들을 만든다.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class DuckIcon {
    const int LIGHT = 170; // 이 밝기 이상이면 '배경 쪽' 으로 번질 수 있음

    public static Bitmap Cutout(Bitmap src) {
        int w = src.Width, h = src.Height;
        var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, w, h);
        var rect = new Rectangle(0, 0, w, h);
        var data = bmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int stride = data.Stride;
        var px = new byte[stride * h];
        Marshal.Copy(data.Scan0, px, 0, px.Length);

        Func<int, int, int> lum = (x, y) => {
            int o = y * stride + x * 4; // BGRA
            return (px[o + 2] * 299 + px[o + 1] * 587 + px[o] * 114) / 1000;
        };
        var outside = new bool[w * h];
        var q = new Queue<int>();
        Action<int, int> visit = (x, y) => {
            int i = y * w + x;
            if (outside[i] || lum(x, y) < LIGHT) return;
            outside[i] = true;
            q.Enqueue(i);
        };
        for (int x = 0; x < w; x++) { visit(x, 0); visit(x, h - 1); }
        for (int y = 0; y < h; y++) { visit(0, y); visit(w - 1, y); }
        while (q.Count > 0) {
            int i = q.Dequeue(), x = i % w, y = i / w;
            if (x > 0) visit(x - 1, y);
            if (x < w - 1) visit(x + 1, y);
            if (y > 0) visit(x, y - 1);
            if (y < h - 1) visit(x, y + 1);
        }
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                if (!outside[y * w + x]) continue;
                int o = y * stride + x * 4;
                int a = 255 - lum(x, y);
                px[o] = px[o + 1] = px[o + 2] = 0;
                px[o + 3] = (byte)Math.Max(0, Math.Min(255, a));
            }
        Marshal.Copy(px, 0, data.Scan0, px.Length);
        bmp.UnlockBits(data);
        return Trim(bmp, 4);
    }

    static Bitmap Trim(Bitmap bmp, int margin) {
        int x0 = bmp.Width, y0 = bmp.Height, x1 = 0, y1 = 0;
        for (int y = 0; y < bmp.Height; y++)
            for (int x = 0; x < bmp.Width; x++)
                if (bmp.GetPixel(x, y).A > 8) {
                    x0 = Math.Min(x0, x); y0 = Math.Min(y0, y);
                    x1 = Math.Max(x1, x); y1 = Math.Max(y1, y);
                }
        x0 = Math.Max(0, x0 - margin); y0 = Math.Max(0, y0 - margin);
        x1 = Math.Min(bmp.Width - 1, x1 + margin); y1 = Math.Min(bmp.Height - 1, y1 + margin);
        return bmp.Clone(new Rectangle(x0, y0, x1 - x0 + 1, y1 - y0 + 1), PixelFormat.Format32bppArgb);
    }

    /// size: 한 변, heightRatio: 오리 높이 비율, radius: 모서리 둥글기 비율(0 = 꽉 찬 정사각)
    public static void Compose(Bitmap duck, string path, int size, double heightRatio, Color bg, double radius) {
        using (var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.Clear(Color.Transparent);
            using (var brush = new SolidBrush(bg)) {
                if (radius <= 0) g.FillRectangle(brush, 0, 0, size, size);
                else {
                    float r = (float)(size * radius), d = r * 2;
                    using (var p = new GraphicsPath()) {
                        p.AddArc(0, 0, d, d, 180, 90);
                        p.AddArc(size - d, 0, d, d, 270, 90);
                        p.AddArc(size - d, size - d, d, d, 0, 90);
                        p.AddArc(0, size - d, d, d, 90, 90);
                        p.CloseFigure();
                        g.FillPath(brush, p);
                    }
                }
            }
            double th = size * heightRatio, tw = th * duck.Width / duck.Height;
            var dest = new RectangleF((float)((size - tw) / 2), (float)((size - th) / 2), (float)tw, (float)th);
            using (var attr = new ImageAttributes()) {
                attr.SetWrapMode(WrapMode.TileFlipXY);
                g.DrawImage(duck, Rectangle.Round(dest), 0, 0, duck.Width, duck.Height, GraphicsUnit.Pixel, attr);
            }
            bmp.Save(path, ImageFormat.Png);
        }
    }
}
'@

$src = Join-Path $root 'brand\app-icon-original.png'
$out = Join-Path $root 'public'
$icons = Join-Path $out 'icons'
New-Item -ItemType Directory -Force $icons | Out-Null
# 아이콘 배경: 인하 스카이블루(#00AFEC)를 옅게 한 하늘색
$mint = [System.Drawing.ColorTranslator]::FromHtml('#b8dcf6')

$orig = [System.Drawing.Bitmap]::FromFile($src)
$duck = [DuckIcon]::Cutout($orig)
$duck.Save((Join-Path $icons 'duck.png'), [System.Drawing.Imaging.ImageFormat]::Png)

[DuckIcon]::Compose($duck, (Join-Path $out 'favicon.png'), 64, 0.86, $mint, 0.22)          # 브라우저 탭
[DuckIcon]::Compose($duck, (Join-Path $icons 'apple-touch-icon.png'), 180, 0.74, $mint, 0) # iOS 홈 화면
[DuckIcon]::Compose($duck, (Join-Path $icons 'icon-192.png'), 192, 0.70, $mint, 0)          # PWA (maskable 안전 영역)
[DuckIcon]::Compose($duck, (Join-Path $icons 'icon-512.png'), 512, 0.70, $mint, 0)
"duck.png $($duck.Width)x$($duck.Height)"
$duck.Dispose(); $orig.Dispose()
Get-ChildItem $out -Recurse -Include *.png | ForEach-Object { "{0,-22} {1,7} B" -f $_.Name, $_.Length }
