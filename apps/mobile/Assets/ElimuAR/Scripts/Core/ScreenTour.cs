#if UNITY_EDITOR
using System;
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace ElimuAR
{
    // Editor-only: walks every screen with real data from a local API and renders each one to Logs/tour.
    public class ScreenTour : MonoBehaviour
    {
        private const int W = 2340, H = 1080;
        private RenderTexture _rt;
        private string _out;
        private string _refs;
        private int _n;

        public static bool Requested => Environment.GetEnvironmentVariable("ELIMU_TOUR") == "1";
        private static bool PreviewsOnly => Environment.GetEnvironmentVariable("ELIMU_TOUR_PREVIEWS") == "1";
        public static bool Finished { get; private set; }
        public static Exception Failure { get; private set; }

        public static void Attach(App app) => app.gameObject.AddComponent<ScreenTour>();

        private IEnumerator Start()
        {
            _out = Path.GetFullPath("Logs/tour");
            _refs = Environment.GetEnvironmentVariable("ELIMU_TOUR_REFS") ?? Path.GetFullPath("../../reference screens");
            if (Directory.Exists(_out)) Directory.Delete(_out, true);
            Directory.CreateDirectory(_out);
            _rt = new RenderTexture(W, H, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            var cam = App.Instance.Rig.Camera;
            cam.targetTexture = _rt;
            var canvas = UiRoot.Instance.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceCamera;
            canvas.worldCamera = cam;
            canvas.planeDistance = 0.3f;
            Session.Server = Environment.GetEnvironmentVariable("ELIMU_TOUR_SERVER") ?? "http://localhost:4000";
            Session.WelcomeSeen = false;
            Session.SignOut();

            Exception failure = null;
            yield return Wrap(PreviewsOnly ? Previews() : Tour(), e => failure = e);
            if (failure != null) Debug.LogWarning("[ElimuAR] tour failed: " + failure);
            Debug.Log($"[ElimuAR] tour wrote {_n} screens to {_out}");
            Failure = failure;
            Finished = true;
        }

        private static IEnumerator Wrap(IEnumerator body, Action<Exception> fail)
        {
            while (true)
            {
                object current;
                try
                {
                    if (!body.MoveNext()) yield break;
                    current = body.Current;
                }
                catch (Exception e) { fail(e); yield break; }
                if (current is IEnumerator nested) yield return Wrap(nested, fail);
                else yield return current;
            }
        }

        private IEnumerator Shot(string name, string reference = null)
        {
            yield return new WaitForSeconds(0.6f);
            yield return new WaitForEndOfFrame();
            var cam = App.Instance.Rig.Camera;
            cam.Render();
            var prev = RenderTexture.active;
            RenderTexture.active = _rt;
            var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, W, H), 0, 0);
            tex.Apply();
            RenderTexture.active = prev;
            _n++;
            var file = Path.Combine(_out, $"{_n:00}-{name}.png");
            File.WriteAllBytes(file, tex.EncodeToPNG());
            if (reference != null) Compare(tex, reference, Path.Combine(_out, $"{_n:00}-{name}-vs-reference.png"));
            Destroy(tex);
            Debug.Log("[ElimuAR] tour " + file);
        }

        /// <summary>Blends the screenshot 50/50 with its comparison image.</summary>
        private void Compare(Texture2D ours, string reference, string file)
        {
            var path = Path.Combine(_refs, reference);
            if (!File.Exists(path)) return;
            var refTex = new Texture2D(2, 2);
            refTex.LoadImage(File.ReadAllBytes(path));
            var blend = new Texture2D(W, H, TextureFormat.RGB24, false);
            var a = ours.GetPixels();
            var px = new Color[W * H];
            for (var y = 0; y < H; y++)
            for (var x = 0; x < W; x++)
            {
                var r = refTex.GetPixelBilinear((x + 0.5f) / W, (y + 0.5f) / H);
                px[y * W + x] = Color.Lerp(a[y * W + x], r, 0.5f);
            }
            blend.SetPixels(px);
            blend.Apply();
            File.WriteAllBytes(file, blend.EncodeToPNG());
            Destroy(blend);
            Destroy(refTex);
        }

        private static void Press(string label)
        {
            var button = UnityEngine.Object.FindObjectsByType<Button>(FindObjectsSortMode.None)
                .FirstOrDefault(b => b.isActiveAndEnabled && b.GetComponentsInChildren<TMPro.TMP_Text>(true).Any(t => t.text == label));
            if (button == null) throw new Exception("no button labelled " + label);
            button.onClick.Invoke();
        }

        private static IEnumerator Until(Func<bool> condition, float seconds, string what)
        {
            var end = Time.realtimeSinceStartup + seconds;
            while (!condition())
            {
                if (Time.realtimeSinceStartup > end) throw new Exception("timed out waiting for " + what);
                yield return null;
            }
        }

        private IEnumerator Tour()
        {
            var app = App.Instance;
            yield return Shot("splash");
            yield return Until(() => UiRoot.Instance.Screens.Find("Welcome") != null, 10, "welcome");
            yield return Shot("welcome");
            Press("I Understand");
            yield return Shot("signin-student");
            AuthScreens.SignIn(false);
            yield return Shot("signin-teacher");

            // Student: sign in with the seeded credentials passed by the launcher.
            var id = Environment.GetEnvironmentVariable("ELIMU_TOUR_STUDENT");
            var pin = Environment.GetEnvironmentVariable("ELIMU_TOUR_STUDENT_SECRET");
            JToken login = null;
            yield return Api.PostAnonymous("/api/auth/student/login",
                new JObject { ["studentIdentifier"] = id, ["password"] = pin }, d => login = d, f => throw new Exception(f.Message));
            Session.SignIn((JObject)login);
            app.EnterHome();
            yield return Until(() => UiRoot.Instance.Screens.Find("Home") != null && Catalog.Activities.Count > 0, 20, "home");
            yield return Shot("home-browse");
            Home.Show(Home.Tab.Assignments);
            yield return new WaitForSeconds(1.5f);
            yield return Shot("home-assignments");
            Home.Show(Home.Tab.Settings);
            yield return Shot("home-settings");
            Home.Show(Home.Tab.Browse);

            foreach (var activity in Catalog.Activities.ToList())
            {
                Home.Detail(activity);
                yield return new WaitForSeconds(1f);
                yield return Shot("detail-" + activity.activityKey);
                Kit.Clear(UiRoot.Instance.Overlay);
                if (!Catalog.IsInstalled(activity))
                {
                    var done = false;
                    string error = null;
                    yield return Catalog.Install(activity, null, () => done = true, e => error = e);
                    if (!done) throw new Exception("install " + activity.activityKey + ": " + error);
                }
                yield return ActivityTour(activity);
            }
            Home.Show(Home.Tab.Library);
            yield return Shot("home-library");

            // Teacher: classes and progress.
            var teacher = Environment.GetEnvironmentVariable("ELIMU_TOUR_TEACHER");
            var teacherSecret = Environment.GetEnvironmentVariable("ELIMU_TOUR_TEACHER_SECRET");
            if (!string.IsNullOrEmpty(teacher))
            {
                yield return Api.PostAnonymous("/api/auth/login",
                    new JObject { ["identifier"] = teacher, ["password"] = teacherSecret }, d => login = d, f => throw new Exception(f.Message));
                Session.SignIn((JObject)login);
                app.EnterHome();
                yield return Until(() => UiRoot.Instance.Screens.Find("Home") != null, 20, "teacher home");
                Home.Show(Home.Tab.Classes);
                yield return new WaitForSeconds(2.5f);
                yield return Shot("teacher-classes");
            }
        }

        private IEnumerator Previews()
        {
            var app = App.Instance;
            yield return Until(() => UiRoot.Instance.Screens.Find("Welcome") != null, 10, "welcome");
            JToken login = null;
            yield return Api.PostAnonymous("/api/auth/login",
                new JObject
                {
                    ["identifier"] = Environment.GetEnvironmentVariable("ELIMU_TOUR_ADMIN"),
                    ["password"] = Environment.GetEnvironmentVariable("ELIMU_TOUR_TEACHER_SECRET"),
                }, d => login = d, f => throw new Exception(f.Message));
            Session.SignIn((JObject)login);
            app.EnterHome();
            yield return Until(() => UiRoot.Instance.Screens.Find("Home") != null && Catalog.Activities.Count > 0, 20, "home");
            var only = Environment.GetEnvironmentVariable("ELIMU_TOUR_ONLY");
            foreach (var activity in Catalog.Activities.ToList())
            {
                if (!string.IsNullOrEmpty(only) && !only.Split(',').Contains(activity.activityKey)) continue;
                if (!Catalog.IsInstalled(activity))
                {
                    var done = false;
                    string error = null;
                    yield return Catalog.Install(activity, null, () => done = true, e => error = e);
                    if (!done) throw new Exception("install " + activity.activityKey + ": " + error);
                }
                app.Recorder.Record(activity);
                yield return null;
                yield return Until(() => !app.Recorder.Busy, 900, "preview of " + activity.activityKey);
                Kit.Clear(UiRoot.Instance.Overlay);
                Debug.Log("[ElimuAR] preview recorded for " + activity.activityKey);
            }
        }

        private IEnumerator ActivityTour(ActivityInfo activity)
        {
            var runner = App.Instance.Runner;
            var key = activity.activityKey;
            runner.Open(activity);
            yield return Until(() => runner.TourReady, 60, "activity " + key);
            if (key == "circulatorysystem")
            {
                runner.TourSetup(false, true);
                yield return Shot(key + "-setup-searching", "Screenshot_20261005-094837.png");
                runner.TourSetup(false, false);
                yield return Shot(key + "-setup-1", "Screenshot_20261005-095033.png");
                runner.TourSetup(true, false);
                yield return Shot(key + "-setup-2");
            }
            runner.TourStep(0);
            yield return new WaitForSeconds(3.5f);
            yield return Shot(key + "-observe", key == "circulatorysystem" ? "Screenshot_20261005-095120.png" : null);
            var explore = runner.TourIndexOf("explore");
            if (explore >= 0)
            {
                runner.TourStep(explore);
                yield return Shot(key + "-explore", key == "circulatorysystem" ? "Screenshot_20261005-095133.png" : null);
            }
            var question = runner.TourIndexOf("question");
            if (question >= 0)
            {
                runner.TourStep(question);
                yield return Shot(key + "-question", key == "circulatorysystem" ? "Screenshot_20261005-095346.png" : null);
                runner.TourAnswer(true);
                yield return Shot(key + "-question-revealed", key == "circulatorysystem" ? "Screenshot_20261005-095421.png" : null);
                if (key == "circulatorysystem")
                {
                    runner.TourMore();
                    yield return Shot(key + "-more", "Screenshot_20261005-095358.png");
                }
            }
            runner.TourScore();
            yield return Shot(key + "-score", key == "circulatorysystem" ? "Screenshot_20261005-094719.png" : null);
            runner.TourClose();
            yield return new WaitForSeconds(0.5f);
        }
    }
}
#endif
