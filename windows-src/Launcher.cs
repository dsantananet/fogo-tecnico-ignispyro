using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;

internal static class Launcher
{
    private const int Port = 49774;
    private const string Origin = "http://127.0.0.1:49774/";
    private static readonly Dictionary<string, string> Types = new Dictionary<string, string> {
        { ".html", "text/html; charset=utf-8" },
        { ".js", "text/javascript; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".svg", "image/svg+xml" }, { ".png", "image/png" }, { ".json", "application/json" },
        { ".webmanifest", "application/manifest+json" }
    };
    private static readonly Dictionary<string, byte[]> Assets = new Dictionary<string, byte[]>();

    private static int Main(string[] args)
    {
        if (Array.IndexOf(args, "--self-test") >= 0)
        {
            LoadAssets();
            return Assets.ContainsKey("/index.html") && Assets.ContainsKey("/app.js") &&
                Assets.ContainsKey("/updates.js") && Assets.ContainsKey("/campo-ui.js") ? 0 : 1;
        }
        using (var mutex = new Mutex(false, "Local\\IgnisPyroFogoTecnico"))
        {
            if (!mutex.WaitOne(0))
            {
                OpenBrowser();
                return 0;
            }
            var listener = new TcpListener(IPAddress.Loopback, Port);
            try
            {
                LoadAssets();
                listener.Start();
                Console.Title = "IGNISPYRO Fogo Técnico";
                Console.WriteLine("IGNISPYRO Fogo Técnico");
                Console.WriteLine("Abre " + Origin + " no navegador deste computador.");
                Console.WriteLine("Mantém esta janela aberta enquanto trabalhas. Ctrl+C para sair.");
                if (Array.IndexOf(args, "--no-browser") < 0) OpenBrowser();
                while (true)
                {
                    var client = listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(_ => Serve(client));
                }
            }
            catch (Exception error)
            {
                Console.Error.WriteLine(error.Message);
                return 1;
            }
            finally
            {
                listener.Stop();
                mutex.ReleaseMutex();
            }
        }
    }

    private static void OpenBrowser()
    {
        Process.Start(new ProcessStartInfo(Origin) { UseShellExecute = true });
    }

    private static void LoadAssets()
    {
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.zip"))
        using (var archive = new ZipArchive(stream, ZipArchiveMode.Read))
        {
            foreach (var entry in archive.Entries)
            {
                if (!Types.ContainsKey(Path.GetExtension(entry.FullName))) continue;
                using (var input = entry.Open())
                using (var output = new MemoryStream())
                {
                    input.CopyTo(output);
                    Assets.Add("/" + entry.FullName, output.ToArray());
                }
            }
        }
    }

    private static void Serve(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.ReceiveTimeout = 3000;
                client.SendTimeout = 3000;
                using (var stream = client.GetStream())
                using (var reader = new StreamReader(stream, Encoding.ASCII))
                {
                    var request = reader.ReadLine();
                    if (request == null) return;
                    var parts = request.Split(' ');
                    bool hasLocalHost = false;
                    for (int index = 0; index < 50; index++)
                    {
                        var header = reader.ReadLine();
                        if (String.IsNullOrEmpty(header)) break;
                        if (header.Equals("Host: 127.0.0.1:" + Port, StringComparison.OrdinalIgnoreCase))
                            hasLocalHost = true;
                    }
                    if (!hasLocalHost || parts.Length != 3 || parts[0] != "GET")
                    {
                        Respond(stream, "400 Bad Request", "text/plain", new byte[0]);
                        return;
                    }
                    var path = parts[1] == "/" ? "/index.html" : parts[1];
                    byte[] body;
                    if (Assets.TryGetValue(path, out body))
                        Respond(stream, "200 OK", Types[Path.GetExtension(path)], body);
                    else
                        Respond(stream, "404 Not Found", "text/plain", new byte[0]);
                }
            }
            catch (IOException) { }
            catch (SocketException) { }
        }
    }

    private static void Respond(Stream stream, string status, string type, byte[] body)
    {
        var header = Encoding.ASCII.GetBytes("HTTP/1.1 " + status +
            "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length +
            "\r\nX-Content-Type-Options: nosniff\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n");
        stream.Write(header, 0, header.Length);
        stream.Write(body, 0, body.Length);
    }
}
