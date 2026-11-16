using System;
using System.Collections;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace ElimuAR
{
    /// <summary>The ElimuAR API over UnityWebRequest.</summary>
    public static class Api
    {
        public class Failure
        {
            public long Status;
            public string Message;
            public bool Offline => Status == 0;
            public override string ToString() => Message;
        }

        public static IEnumerator Get(string path, Action<JToken> ok, Action<Failure> fail) =>
            Send("GET", path, null, true, true, ok, fail);

        public static IEnumerator Post(string path, JObject body, Action<JToken> ok, Action<Failure> fail) =>
            Send("POST", path, body, true, true, ok, fail);

        public static IEnumerator PostAnonymous(string path, JObject body, Action<JToken> ok, Action<Failure> fail) =>
            Send("POST", path, body, false, true, ok, fail);

        public static string Url(string path) => Session.Server.TrimEnd('/') + path;

        private static IEnumerator Send(string method, string path, JObject body, bool auth, bool mayRefresh,
            Action<JToken> ok, Action<Failure> fail)
        {
            using (var request = new UnityWebRequest(Url(path), method))
            {
                request.downloadHandler = new DownloadHandlerBuffer();
                if (body != null)
                {
                    request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString()));
                    request.SetRequestHeader("Content-Type", "application/json");
                }
                request.SetRequestHeader("Accept", "application/json");
                if (auth && Session.SignedIn) request.SetRequestHeader("Authorization", "Bearer " + Session.AccessToken);
                request.timeout = 30;
                yield return request.SendWebRequest();

                if (request.responseCode == 401 && auth && mayRefresh)
                {
                    var refreshed = false;
                    yield return Refresh(r => refreshed = r);
                    if (refreshed)
                    {
                        yield return Send(method, path, body, true, false, ok, fail);
                        yield break;
                    }
                }

                if (request.result == UnityWebRequest.Result.ConnectionError)
                {
                    fail?.Invoke(new Failure
                    {
                        Status = 0,
                        Message = "Could not reach ElimuAR at " + Session.Server + ". Check the Wi-Fi and the server address.",
                    });
                    yield break;
                }

                var text = request.downloadHandler.text;
                JToken root = null;
                try { if (!string.IsNullOrEmpty(text)) root = JToken.Parse(text); }
                catch (Exception) { /* reported below */ }

                if (request.responseCode >= 400)
                {
                    var message = root?["error"]?["message"]?.ToString();
                    fail?.Invoke(new Failure
                    {
                        Status = request.responseCode,
                        Message = string.IsNullOrEmpty(message) ? "The server answered " + request.responseCode + "." : message,
                    });
                    yield break;
                }
                if (root == null)
                {
                    fail?.Invoke(new Failure { Status = request.responseCode, Message = "The server sent an answer this app cannot read." });
                    yield break;
                }
                ok?.Invoke(root["data"] ?? root);
            }
        }

        public static IEnumerator Refresh(Action<bool> done)
        {
            if (string.IsNullOrEmpty(Session.RefreshToken)) { done(false); yield break; }
            var success = false;
            yield return Send("POST", "/api/auth/refresh", new JObject { ["refreshToken"] = Session.RefreshToken }, false, false,
                data =>
                {
                    var tokens = data["tokens"];
                    if (tokens == null) return;
                    Session.SetTokens((string)tokens["accessToken"], (string)tokens["refreshToken"]);
                    success = true;
                },
                _ => { });
            done(success);
        }

        // Downloads a file to disk with progress, through a temporary file so an interrupted download never
        // leaves a half bundle that looks installed.
        public static IEnumerator Download(string path, string destination, Action<float> progress,
            Action ok, Action<Failure> fail, bool auth = true, bool mayRefresh = true)
        {
            var temp = destination + ".part";
            Directory.CreateDirectory(Path.GetDirectoryName(destination));
            if (File.Exists(temp)) File.Delete(temp);
            using (var request = UnityWebRequest.Get(Url(path)))
            {
                request.downloadHandler = new DownloadHandlerFile(temp) { removeFileOnAbort = true };
                if (auth && Session.SignedIn) request.SetRequestHeader("Authorization", "Bearer " + Session.AccessToken);
                var op = request.SendWebRequest();
                while (!op.isDone)
                {
                    progress?.Invoke(request.downloadProgress);
                    yield return null;
                }
                if (request.responseCode == 401 && auth && mayRefresh)
                {
                    var refreshed = false;
                    yield return Refresh(r => refreshed = r);
                    if (refreshed)
                    {
                        yield return Download(path, destination, progress, ok, fail, true, false);
                        yield break;
                    }
                }
                if (request.result != UnityWebRequest.Result.Success)
                {
                    if (File.Exists(temp)) File.Delete(temp);
                    fail?.Invoke(new Failure
                    {
                        Status = request.result == UnityWebRequest.Result.ConnectionError ? 0 : request.responseCode,
                        Message = request.result == UnityWebRequest.Result.ConnectionError
                            ? "The download stopped. Check the Wi-Fi and try again."
                            : "The download failed (" + request.responseCode + ").",
                    });
                    yield break;
                }
            }
            if (File.Exists(destination)) File.Delete(destination);
            File.Move(temp, destination);
            progress?.Invoke(1f);
            ok?.Invoke();
        }

        /// <summary>Fetches an image (public) as a texture.</summary>
        public static IEnumerator Texture(string path, Action<Texture2D> ok)
        {
            using (var request = UnityWebRequestTexture.GetTexture(path.StartsWith("http") ? path : Url(path)))
            {
                yield return request.SendWebRequest();
                if (request.result == UnityWebRequest.Result.Success) ok(DownloadHandlerTexture.GetContent(request));
            }
        }
    }
}
