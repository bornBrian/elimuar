using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace ElimuAR
{
    // Makes an activity's web preview: plays its Observe scene off-camera (the animated model, no camera
    // feed, no chrome) and records it at a fixed 12 frames per second of animation time.
    public class PreviewRecorder : MonoBehaviour
    {
        private const int Fps = 12;
        private const int Width = 1280, Height = 592;
        private const int Batch = 40;

        public bool Busy { get; private set; }

        public void Record(ActivityInfo info) => StartCoroutine(RecordRoutine(info));

        private IEnumerator RecordRoutine(ActivityInfo info)
        {
            if (Busy) yield break;
            Busy = true;
            var ui = UiRoot.Instance;
            var cover = ui.Busy("Preparing the preview of " + info.title + "...");
            var label = cover.GetComponentsInChildren<TMPro.TextMeshProUGUI>().LastOrDefault();
            void Say(string text) { if (label != null) label.text = text; }

            var manifest = Catalog.LoadManifest(info.activityKey);
            var path = Catalog.BundlePath(info);
            if (manifest == null || path == null)
            {
                Destroy(cover.gameObject);
                ui.Notice("Download it first", "Download " + info.title + " on this phone, then make its preview.");
                Busy = false;
                yield break;
            }

            // A stage of its own, far from anything else in the scene.
            var holder = new GameObject("Preview Stage").transform;
            holder.position = new Vector3(0, -500, 0);
            ActivityScene scene = null;
            string error = null;
            yield return ActivityScene.Load(path, manifest, holder, s => scene = s, e => error = e);
            if (scene == null)
            {
                Destroy(holder.gameObject);
                Destroy(cover.gameObject);
                ui.Notice("Preview not made", error ?? "The activity did not load.");
                Busy = false;
                yield break;
            }

            var observe = manifest.sections.FirstOrDefault(s => s.kind == "observe")?.steps.FirstOrDefault();
            var roots = manifest.sections.SelectMany(s => s.steps).SelectMany(s => s.objectPaths ?? new List<string>()).Distinct();
            foreach (var p in roots)
            {
                var t = scene.Find(p);
                if (t != null) t.gameObject.SetActive(observe != null && observe.objectPaths.Contains(p));
            }
            scene.Ground();
            new Faders(scene, this).Ghost(null);

            // How long Observe runs: its narration, or its captions.
            var clip = scene.Clip(observe?.voClip);
            var seconds = clip != null ? clip.length : (observe?.captions ?? new List<Caption>()).Where(c => c.duration > 0).Sum(c => c.duration);
            seconds = Mathf.Clamp(seconds <= 0 ? 10 : seconds, 3, 180);
            var frames = Mathf.CeilToInt(seconds * Fps);

            var camera = FrameCamera(scene.Root, holder);
            var intro = scene.Find(manifest.intro?.path ?? manifest.animator?.path);
            if (intro != null)
                foreach (var animator in intro.GetComponentsInChildren<Animator>(true)) { animator.Rebind(); animator.Update(0f); }

            var dir = Path.Combine(Application.temporaryCachePath, "preview-" + info.activityKey);
            if (Directory.Exists(dir)) Directory.Delete(dir, true);
            Directory.CreateDirectory(dir);
            var tex = new Texture2D(Width, Height, TextureFormat.RGB24, false);

            // Fixed animation time per rendered frame: nothing here waits on the clock.
            Time.captureFramerate = Fps;
            try
            {
                for (var i = 0; i < frames; i++)
                {
                    yield return new WaitForEndOfFrame();
                    camera.Render();
                    var previous = RenderTexture.active;
                    RenderTexture.active = camera.targetTexture;
                    tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
                    tex.Apply(false);
                    RenderTexture.active = previous;
                    File.WriteAllBytes(Path.Combine(dir, i.ToString("00000") + ".jpg"), tex.EncodeToJPG(82));
                    if (i % Fps == 0) Say($"Recording {info.title}... {Mathf.RoundToInt(100f * i / frames)}%");
                }
            }
            finally
            {
                Time.captureFramerate = 0;
            }

            Destroy(tex);
            Destroy(camera.targetTexture);
            Destroy(camera.gameObject);
            scene.Unload();
            Destroy(holder.gameObject);

            // Upload in batches, then ask the server to make the video.
            string failure = null;
            yield return Api.Post("/api/ar-activities/" + info.activityKey + "/observe-frames/start", new JObject(), _ => { }, f => failure = f.Message);
            var files = Directory.GetFiles(dir, "*.jpg").OrderBy(f => f).ToList();
            for (var start = 0; failure == null && start < files.Count; start += Batch)
            {
                Say($"Uploading the preview... {Mathf.RoundToInt(100f * start / files.Count)}%");
                yield return Upload(info.activityKey, files.Skip(start).Take(Batch).ToList(), e => failure = e);
            }
            if (failure == null)
            {
                Say("Making the video...");
                yield return Api.Post("/api/ar-activities/" + info.activityKey + "/observe-frames/finish",
                    new JObject { ["fps"] = Fps, ["frames"] = files.Count }, _ => { }, f => failure = f.Message);
            }
            Directory.Delete(dir, true);
            Destroy(cover.gameObject);
            Busy = false;
            if (failure != null) ui.Notice("Preview not uploaded", failure);
            else ui.Notice("Preview ready", info.title + "'s Observe scene now plays in the web console with its narration.");
        }

        /// <summary>A camera of its own, looking at the model from slightly above, filling the frame.</summary>
        private static Camera FrameCamera(Transform root, Transform holder)
        {
            var bounds = new Bounds(root.position, Vector3.zero);
            var any = false;
            foreach (var r in root.GetComponentsInChildren<Renderer>(false))
            {
                if (r is ParticleSystemRenderer) continue;
                if (!any) { bounds = r.bounds; any = true; }
                else bounds.Encapsulate(r.bounds);
            }
            var go = new GameObject("Preview Camera");
            var cam = go.AddComponent<Camera>();
            cam.enabled = false;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = Theme.Paper;
            cam.fieldOfView = 35;
            cam.nearClipPlane = 0.005f;
            cam.farClipPlane = 50f;
            cam.targetTexture = new RenderTexture(Width, Height, 24) { antiAliasing = 4 };
            var height = Mathf.Max(bounds.size.y, bounds.size.x / cam.aspect, 0.05f);
            var distance = height * 0.62f / Mathf.Tan(cam.fieldOfView * 0.5f * Mathf.Deg2Rad);
            var pitch = Quaternion.Euler(10, 0, 0);
            go.transform.rotation = pitch;
            go.transform.position = bounds.center - pitch * Vector3.forward * distance;
            return cam;
        }

        private static IEnumerator Upload(string key, List<string> files, Action<string> fail)
        {
            var form = new List<IMultipartFormSection>();
            foreach (var f in files) form.Add(new MultipartFormFileSection("frames", File.ReadAllBytes(f), Path.GetFileName(f), "image/jpeg"));
            for (var attempt = 0; attempt < 2; attempt++)
            {
                using (var request = UnityWebRequest.Post(Api.Url("/api/ar-activities/" + key + "/observe-frames"), form))
                {
                    request.SetRequestHeader("Authorization", "Bearer " + Session.AccessToken);
                    request.timeout = 120;
                    yield return request.SendWebRequest();
                    if (request.responseCode == 401 && attempt == 0)
                    {
                        var ok = false;
                        yield return Api.Refresh(r => ok = r);
                        if (ok) continue;
                    }
                    if (request.result != UnityWebRequest.Result.Success) fail("Upload failed (" + request.responseCode + "): " + request.error);
                    yield break;
                }
            }
        }
    }
}
