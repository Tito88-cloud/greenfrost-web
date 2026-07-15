$source = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class BgRemoverFast {
    public static void Process(string inPath, string outPath) {
        Bitmap bmp = new Bitmap(inPath);
        int w = bmp.Width;
        int h = bmp.Height;
        
        BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        int bytes = Math.Abs(data.Stride) * h;
        byte[] rgbValues = new byte[bytes];
        Marshal.Copy(data.Scan0, rgbValues, 0, bytes);
        
        bool[] visited = new bool[w * h];
        Queue<int> qx = new Queue<int>();
        Queue<int> qy = new Queue<int>();
        
        Action<int, int> enqueue = (x, y) => {
            if (x >= 0 && x < w && y >= 0 && y < h) {
                if (!visited[y * w + x]) {
                    visited[y * w + x] = true;
                    qx.Enqueue(x);
                    qy.Enqueue(y);
                }
            }
        };
        
        for (int x = 0; x < w; x++) { enqueue(x, 0); enqueue(x, h - 1); }
        for (int y = 0; y < h; y++) { enqueue(0, y); enqueue(w - 1, y); }
        
        while (qx.Count > 0) {
            int x = qx.Dequeue();
            int y = qy.Dequeue();
            
            int idx = (y * data.Stride) + (x * 4);
            byte b = rgbValues[idx];
            byte g = rgbValues[idx + 1];
            byte r = rgbValues[idx + 2];
            byte a = rgbValues[idx + 3];
            
            bool isBg = false;
            if (a == 0) {
                isBg = true;
            } else if (r > 185 && g > 185 && b > 185) {
                if (Math.Abs(r - g) < 25 && Math.Abs(g - b) < 25 && Math.Abs(r - b) < 25) {
                    isBg = true;
                }
            }
            
            if (isBg) {
                rgbValues[idx] = 255;
                rgbValues[idx + 1] = 255;
                rgbValues[idx + 2] = 255;
                rgbValues[idx + 3] = 255;
                enqueue(x - 1, y);
                enqueue(x + 1, y);
                enqueue(x, y - 1);
                enqueue(x, y + 1);
            }
        }
        
        Marshal.Copy(rgbValues, 0, data.Scan0, bytes);
        bmp.UnlockBits(data);
        
        Bitmap bmpCopy = new Bitmap(bmp);
        bmp.Dispose();
        bmpCopy.Save(outPath, ImageFormat.Png);
        bmpCopy.Dispose();
    }
}
"@
Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing
[BgRemoverFast]::Process($args[0], $args[1])
Write-Host "Processed $($args[0])"
