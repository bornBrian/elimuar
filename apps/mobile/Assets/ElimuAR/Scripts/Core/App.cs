using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace ElimuAR
{
    /// <summary>The app root: owns the UI, the activity runner and the preview recorder.</summary>
    public class App : MonoBehaviour
    {
        public static App Instance { get; private set; }

        public UiRoot Ui { get; private set; }
        public ArRig Rig { get; private set; }
        public Stage Stage { get; private set; }
        public ActivityRunner Runner { get; private set; }
        public PreviewRecorder Recorder { get; private set; }

        private readonly Stack<Action> _back = new Stack<Action>();

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            if (Instance != null) return;
            var go = new GameObject("ElimuAR-App");
            DontDestroyOnLoad(go);
            go.AddComponent<App>();
        }

        private void Awake()
        {
            Instance = this;
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Screen.orientation = ScreenOrientation.LandscapeLeft;
            Screen.autorotateToLandscapeLeft = true;
            Screen.autorotateToLandscapeRight = true;
            Screen.autorotateToPortrait = false;
            Screen.autorotateToPortraitUpsideDown = false;
            Screen.orientation = ScreenOrientation.AutoRotation;

            Rig = ArRig.Create();
            Stage = Stage.Create();
            Ui = UiRoot.Create();
            Runner = gameObject.AddComponent<ActivityRunner>();
            Recorder = gameObject.AddComponent<PreviewRecorder>();
#if UNITY_EDITOR
            if (ScreenTour.Requested) ScreenTour.Attach(this);
#endif
        }

        private IEnumerator Start()
        {
            AuthScreens.Splash();
            StartCoroutine(SyncWhenOnline());
            var started = Time.realtimeSinceStartup;
            yield return Rig.Probe();
            if (Session.SignedIn) yield return Api.Refresh(_ => { });
            while (Time.realtimeSinceStartup - started < SplashMotion.Length) yield return null;

            if (!Session.WelcomeSeen) AuthScreens.Welcome(Continue);
            else Continue();
        }

        private void Continue()
        {
            if (Session.SignedIn) EnterHome();
            else AuthScreens.SignIn(PlayerPrefs.GetString("lastMode", "student") == "student");
        }

        public void Run(IEnumerator routine) => StartCoroutine(routine);

        /// <summary>Signed in: pull this learner's state, then show home.</summary>
        public void EnterHome()
        {
            PlayerPrefs.SetString("lastMode", Session.IsStudent ? "student" : "teacher");
            Scores.ResetForUser();
            Catalog.ResetForUser();
            _back.Clear();
            StartCoroutine(EnterHomeRoutine());
        }

        private IEnumerator EnterHomeRoutine()
        {
            var busy = Ui.Busy("Getting your activities...");
            yield return Api.Get("/api/auth/me", d => Session.UpdateUser(d["user"] as Newtonsoft.Json.Linq.JObject), _ => { });
            yield return Catalog.Refresh(_ => { });
            if (Session.IsStudent)
            {
                Scores.HandInDraft();
                yield return Scores.Flush();
                yield return Scores.Pull();
            }
            yield return Catalog.PullArchived();
            Destroy(busy.gameObject);
            Home.Show();
        }

        public void SignOut()
        {
            Ui.Confirm("Sign Out?", "Your scores and downloaded activities stay on this device.", "Sign Out", "Cancel", () =>
            {
                Run(Api.Post("/api/auth/logout", new Newtonsoft.Json.Linq.JObject { ["refreshToken"] = Session.RefreshToken }, _ => { }, _ => { }));
                Session.SignOut();
                _back.Clear();
                AuthScreens.SignIn();
            });
        }

        // ---- back --------------------------------------------------------------

        public void PushBack(Action action) => _back.Push(action);

        public void Back()
        {
            if (_back.Count > 0) _back.Pop()?.Invoke();
            else if (Session.SignedIn) Home.Show();
            else AuthScreens.SignIn();
        }

        private void Update()
        {
            if (!Input.GetKeyDown(KeyCode.Escape)) return;
            if (Runner.InActivity) Runner.RequestExit();
            else if (_back.Count > 0) Back();
            else if (Session.SignedIn) Home.Show();
        }

        private void OnApplicationPause(bool paused)
        {
            if (!paused && Session.IsStudent) StartCoroutine(Scores.Flush());
        }

        // Runs played offline go up on their own once the phone is back on a network: checked every few
        // seconds, and at once when it reconnects.
        private IEnumerator SyncWhenOnline()
        {
            var wasOnline = Application.internetReachability != NetworkReachability.NotReachable;
            var next = 0f;
            while (true)
            {
                yield return new WaitForSecondsRealtime(2f);
                var online = Application.internetReachability != NetworkReachability.NotReachable;
                var reconnected = online && !wasOnline;
                wasOnline = online;
                if (!online || !Session.IsStudent || Scores.Pending == 0) continue;
                if (!reconnected && Time.realtimeSinceStartup < next) continue;
                next = Time.realtimeSinceStartup + 20f;
                yield return Scores.Flush();
            }
        }
    }
}
