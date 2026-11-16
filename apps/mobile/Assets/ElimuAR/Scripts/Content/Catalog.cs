using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace ElimuAR
{
    /// <summary>One activity in the school's catalogue (GET /api/ar-activities).</summary>
    public class ActivityInfo
    {
        public string id;
        public string activityKey;
        public string title;
        public string description;
        public string category;
        public string subjectName;
        public List<string> tags = new List<string>();
        public string gradeLevel;
        public string bundleFile;
        public int bundleVersion;
        public string version;
        public long bundleSizeBytes;
        public bool hasScore = true;
        public int minUsers = 1;
        public int maxUsers = 1;
        public string status;
        public string thumbnailUrl;
        public string lessonId;
        public string updatedAt;

        /// <summary>The description without its "Tip:" paragraph.</summary>
        [JsonIgnore] public string Body => SplitTip().body;
        [JsonIgnore] public string Tip => SplitTip().tip;

        private (string body, string tip) SplitTip()
        {
            var d = description ?? "";
            var i = d.IndexOf("<b>Tip:</b>", StringComparison.OrdinalIgnoreCase);
            return i < 0 ? (d.Trim(), null) : (d.Substring(0, i).Trim(), d.Substring(i + 11).Trim());
        }

        [JsonIgnore] public string SizeLabel => bundleSizeBytes >= 1024 * 1024
            ? (bundleSizeBytes / 1048576f).ToString("0.0") + " MB"
            : Mathf.Max(1, bundleSizeBytes / 1024) + " KB";
    }

    public enum InstallState { NotInstalled, Installed, UpdateAvailable }

    /// <summary>The catalogue and what is on this device.</summary>
    public static class Catalog
    {
        public static List<ActivityInfo> Activities = new List<ActivityInfo>();
        public static bool Offline;

        private static readonly Dictionary<string, Texture2D> Thumbs = new Dictionary<string, Texture2D>();
        private static string Root => Application.persistentDataPath;
        private static string BundleDir => Path.Combine(Root, "bundles");
        private static string ManifestDir => Path.Combine(Root, "manifests");
        private static string ThumbDir => Path.Combine(Root, "thumbs");
        private static string ListCache => Path.Combine(Root, "catalog.json");
        private static string InstalledFile => Path.Combine(Root, "installed.json");
        private static string ArchiveFile => Path.Combine(Root, "archived-" + Session.UserId + ".json");

        // ---- the list -----------------------------------------------------------

        public static IEnumerator Refresh(Action<string> done)
        {
            string error = null;
            JToken data = null;
            yield return Api.Get("/api/ar-activities", d => data = d, f => error = f.Offline ? null : f.Message);
            if (data != null)
            {
                Activities = data.ToObject<List<ActivityInfo>>() ?? new List<ActivityInfo>();
                File.WriteAllText(ListCache, data.ToString());
                Offline = false;
            }
            else
            {
                Offline = true;
                if (File.Exists(ListCache))
                    Activities = JsonConvert.DeserializeObject<List<ActivityInfo>>(File.ReadAllText(ListCache)) ?? new List<ActivityInfo>();
            }
            done?.Invoke(error);
        }

        public static ActivityInfo Find(string key) => Activities.FirstOrDefault(a => a.activityKey == key);

        public static IEnumerable<string> Subjects() =>
            Activities.Select(a => a.subjectName ?? a.category).Where(s => !string.IsNullOrEmpty(s)).Distinct();

        // ---- install state -------------------------------------------------------

        private static Dictionary<string, InstalledRecord> _installed;

        private class InstalledRecord
        {
            public string bundleFile;
            public int bundleVersion;
            public string version;
            public long size;
        }

        private static Dictionary<string, InstalledRecord> Installed
        {
            get
            {
                if (_installed != null) return _installed;
                try
                {
                    _installed = File.Exists(InstalledFile)
                        ? JsonConvert.DeserializeObject<Dictionary<string, InstalledRecord>>(File.ReadAllText(InstalledFile))
                        : null;
                }
                catch (Exception) { _installed = null; }
                return _installed ??= new Dictionary<string, InstalledRecord>();
            }
        }

        private static void SaveInstalled() => File.WriteAllText(InstalledFile, JsonConvert.SerializeObject(Installed));

        public static InstallState StateOf(ActivityInfo a)
        {
            if (!Installed.TryGetValue(a.activityKey, out var rec) || !File.Exists(Path.Combine(BundleDir, rec.bundleFile)))
                return InstallState.NotInstalled;
            return rec.bundleVersion < a.bundleVersion ? InstallState.UpdateAvailable : InstallState.Installed;
        }

        public static bool IsInstalled(ActivityInfo a) => StateOf(a) != InstallState.NotInstalled;

        public static string BundlePath(ActivityInfo a) =>
            Installed.TryGetValue(a.activityKey, out var rec) ? Path.Combine(BundleDir, rec.bundleFile) : null;

        public static string InstalledVersion(ActivityInfo a) =>
            Installed.TryGetValue(a.activityKey, out var rec) ? rec.version : null;

        public static long InstalledBytes() => Installed.Values.Sum(r => r.size);

        /// <summary>Downloads the bundle and its manifest, then marks the activity installed.</summary>
        public static IEnumerator Install(ActivityInfo a, Action<float> progress, Action ok, Action<string> fail)
        {
            Api.Failure failure = null;
            JToken manifest = null;
            yield return Api.Get("/api/ar-activities/" + a.activityKey + "/manifest", d => manifest = d["manifest"], f => failure = f);
            if (manifest == null)
            {
                fail(failure?.Message ?? "This activity has no playable content yet.");
                yield break;
            }
            var target = Path.Combine(BundleDir, a.bundleFile);
            yield return Api.Download("/api/ar-activities/files/bundles/" + a.bundleFile, target,
                p => progress?.Invoke(p * 0.98f), () => { }, f => failure = f);
            if (!File.Exists(target))
            {
                fail(failure?.Message ?? "The download failed.");
                yield break;
            }
            Directory.CreateDirectory(ManifestDir);
            File.WriteAllText(ManifestPath(a.activityKey), manifest.ToString());

            // A replaced version's file goes; the score stays (it is keyed by activity).
            if (Installed.TryGetValue(a.activityKey, out var old) && old.bundleFile != a.bundleFile)
            {
                var oldPath = Path.Combine(BundleDir, old.bundleFile);
                if (File.Exists(oldPath)) File.Delete(oldPath);
            }
            Installed[a.activityKey] = new InstalledRecord
            {
                bundleFile = a.bundleFile,
                bundleVersion = a.bundleVersion,
                version = a.version,
                size = new FileInfo(target).Length,
            };
            SaveInstalled();
            progress?.Invoke(1f);
            ok();
        }

        public static void Uninstall(ActivityInfo a)
        {
            var path = BundlePath(a);
            if (path != null && File.Exists(path)) File.Delete(path);
            var manifest = ManifestPath(a.activityKey);
            if (File.Exists(manifest)) File.Delete(manifest);
            Installed.Remove(a.activityKey);
            SaveInstalled();
        }

        private static string ManifestPath(string key) => Path.Combine(ManifestDir, key + ".json");

        public static ActivityManifest LoadManifest(string key)
        {
            var path = ManifestPath(key);
            return File.Exists(path) ? JsonConvert.DeserializeObject<ActivityManifest>(File.ReadAllText(path)) : null;
        }

        // ---- archive (the learner's own list; the score is kept) --------------------

        private static HashSet<string> _archived;

        public static HashSet<string> Archived
        {
            get
            {
                if (_archived != null) return _archived;
                try
                {
                    _archived = File.Exists(ArchiveFile)
                        ? JsonConvert.DeserializeObject<HashSet<string>>(File.ReadAllText(ArchiveFile))
                        : null;
                }
                catch (Exception) { _archived = null; }
                return _archived ??= new HashSet<string>();
            }
        }

        public static void ResetForUser() { _archived = null; }

        public static IEnumerator SetArchived(ActivityInfo a, bool archived)
        {
            if (archived) Archived.Add(a.activityKey);
            else Archived.Remove(a.activityKey);
            File.WriteAllText(ArchiveFile, JsonConvert.SerializeObject(Archived));
            if (archived) Uninstall(a);
            if (Session.SignedIn)
                yield return Api.Post("/api/activities/" + a.activityKey + "/archive",
                    new JObject { ["archived"] = archived }, _ => { }, _ => { });
        }

        public static IEnumerator PullArchived()
        {
            JToken data = null;
            yield return Api.Get("/api/activities/states", d => data = d, _ => { });
            if (data == null) yield break;
            _archived = new HashSet<string>(data.Where(s => (bool?)s["archived"] == true).Select(s => (string)s["activityKey"]));
            File.WriteAllText(ArchiveFile, JsonConvert.SerializeObject(_archived));
        }

        // ---- thumbnails ---------------------------------------------------------

        public static IEnumerator Thumbnail(ActivityInfo a, Action<Texture2D> ok)
        {
            if (string.IsNullOrEmpty(a.thumbnailUrl)) yield break;
            var name = Path.GetFileName(a.thumbnailUrl);
            if (Thumbs.TryGetValue(name, out var t)) { ok(t); yield break; }
            var file = Path.Combine(ThumbDir, name);
            if (File.Exists(file))
            {
                var tex = new Texture2D(2, 2);
                tex.LoadImage(File.ReadAllBytes(file));
                Thumbs[name] = tex;
                ok(tex);
                yield break;
            }
            Texture2D got = null;
            yield return Api.Texture(a.thumbnailUrl, tex => got = tex);
            if (got == null) yield break;
            Directory.CreateDirectory(ThumbDir);
            File.WriteAllBytes(file, got.EncodeToPNG());
            Thumbs[name] = got;
            ok(got);
        }
    }
}
