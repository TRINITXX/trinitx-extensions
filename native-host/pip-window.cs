// Native messaging host of the TRINITX extension: moves and resizes Chrome's
// Twitch picture-in-picture window at the Windows level.
//
// Chrome caps any scripted grow of a PiP window (chrome.windows, resizeTo) at
// 25 % of the screen area; a Windows SetWindowPos only meets the 80 % cap of
// a manual resize. The pin button of the PiP window goes through here to
// reach a saved place bigger than the current window (Alexis, 31/10/2026).
//
// Protocol (Chrome native messaging): one request per launch, a 4-byte length
// then UTF-8 JSON in Chrome's own units (CSS px of chrome.windows):
// { "left", "top", "width", "height" } the place wanted, { "nowLeft",
// "nowTop", "nowWidth", "nowHeight" } where Chrome says the window is now,
// and "dpr" the screen scale. Chrome's bounds and the Windows rect differ by a
// frame offset (measured: 24 px at the top at 300 %), so the host converts
// through the window's current rect instead of a bare multiplication.
// Replies { "ok": true } or { "ok": false, "error": "..." }.
// Built and registered by install.ps1.

using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

static class PipWindowHost
{
    delegate bool EnumProc(IntPtr hwnd, IntPtr lparam);

    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr lparam);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int max);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);

    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int Left, Top, Right, Bottom; }

    const int GWL_EXSTYLE = -20;
    const int WS_EX_TOPMOST = 0x8;
    const uint SWP_NOZORDER = 0x0004;
    const uint SWP_NOACTIVATE = 0x0010;
    const uint SWP_ASYNCWINDOWPOS = 0x4000;
    // Physical pixels, like the coordinates the extension sends.
    static readonly IntPtr PER_MONITOR_AWARE_V2 = new IntPtr(-4);

    static int Main()
    {
        SetProcessDpiAwarenessContext(PER_MONITOR_AWARE_V2);
        Stream input = Console.OpenStandardInput();
        Stream output = Console.OpenStandardOutput();
        string request = ReadMessage(input);
        if (request == null) return 1;
        WriteMessage(output, Handle(request));
        return 0;
    }

    static string Handle(string request)
    {
        string[] keys = { "left", "top", "width", "height", "nowLeft", "nowTop", "nowWidth", "nowHeight", "dpr" };
        double[] v = new double[keys.Length];
        for (int i = 0; i < keys.Length; i++)
        {
            double? n = ParseNumber(request, keys[i]);
            if (n == null) return "{\"ok\":false,\"error\":\"bad request: " + keys[i] + "\"}";
            v[i] = n.Value;
        }
        double dpr = v[8];
        if (dpr <= 0 || dpr > 8 || v[2] < 100 || v[3] < 100 || v[2] > 20000 || v[3] > 20000)
            return "{\"ok\":false,\"error\":\"bad request: values\"}";
        IntPtr pip = FindPip();
        if (pip == IntPtr.Zero) return "{\"ok\":false,\"error\":\"no Twitch PiP window\"}";
        RECT now;
        if (!GetWindowRect(pip, out now)) return "{\"ok\":false,\"error\":\"GetWindowRect refused\"}";
        // Each edge keeps the offset it has now between Chrome's bounds and
        // the Windows rect.
        int x = (int)Math.Round(v[0] * dpr + (now.Left - v[4] * dpr));
        int y = (int)Math.Round(v[1] * dpr + (now.Top - v[5] * dpr));
        int w = (int)Math.Round(v[2] * dpr + ((now.Right - now.Left) - v[6] * dpr));
        int h = (int)Math.Round(v[3] * dpr + ((now.Bottom - now.Top) - v[7] * dpr));
        // Asks Chrome's thread to move its window, without activating it or
        // changing its z-order (it stays topmost, the focus stays put).
        bool ok = SetWindowPos(pip, IntPtr.Zero, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS);
        return ok ? "{\"ok\":true}" : "{\"ok\":false,\"error\":\"SetWindowPos refused\"}";
    }

    static double? ParseNumber(string json, string key)
    {
        Match m = Regex.Match(json, "\"" + key + "\"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)");
        if (!m.Success) return null;
        return double.Parse(m.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
    }

    // The extension's PiP window: a visible topmost Chrome window titled after
    // the Twitch tab ("Kamet0 - Twitch").
    static IntPtr FindPip()
    {
        IntPtr found = IntPtr.Zero;
        EnumWindows((hwnd, lparam) =>
        {
            if (!IsWindowVisible(hwnd) || (GetWindowLong(hwnd, GWL_EXSTYLE) & WS_EX_TOPMOST) == 0) return true;
            StringBuilder title = new StringBuilder(256);
            GetWindowText(hwnd, title, title.Capacity);
            if (!title.ToString().TrimEnd().EndsWith("Twitch")) return true;
            uint pid;
            GetWindowThreadProcessId(hwnd, out pid);
            try
            {
                if (!Process.GetProcessById((int)pid).ProcessName.Equals("chrome", StringComparison.OrdinalIgnoreCase)) return true;
            }
            catch (ArgumentException)
            {
                return true;
            }
            found = hwnd;
            return false;
        }, IntPtr.Zero);
        return found;
    }

    static string ReadMessage(Stream input)
    {
        byte[] header = ReadExactly(input, 4);
        if (header == null) return null;
        int length = BitConverter.ToInt32(header, 0);
        if (length <= 0 || length > 4096) return null;
        byte[] body = ReadExactly(input, length);
        return body == null ? null : Encoding.UTF8.GetString(body);
    }

    static byte[] ReadExactly(Stream input, int count)
    {
        byte[] buffer = new byte[count];
        int read = 0;
        while (read < count)
        {
            int n = input.Read(buffer, read, count - read);
            if (n <= 0) return null;
            read += n;
        }
        return buffer;
    }

    static void WriteMessage(Stream output, string json)
    {
        byte[] body = Encoding.UTF8.GetBytes(json);
        output.Write(BitConverter.GetBytes(body.Length), 0, 4);
        output.Write(body, 0, body.Length);
        output.Flush();
    }
}
