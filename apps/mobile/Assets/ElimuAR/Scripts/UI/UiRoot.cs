using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace ElimuAR
{
    // The canvas everything is drawn on, in three layers: full screens, the AR chrome (HUD) over the camera,
    // and an overlay for dialogs and toasts.
    public class UiRoot : MonoBehaviour
    {
        public static UiRoot Instance { get; private set; }

        public RectTransform Screens { get; private set; }
        public RectTransform Hud { get; private set; }
        public RectTransform Overlay { get; private set; }
        public RectTransform Safe { get; private set; }
        private RawImage _paper;
        private Image _white;
        private RectTransform _toast;

        public static UiRoot Create()
        {
            var go = new GameObject("ElimuAR-UI", typeof(RectTransform));
            DontDestroyOnLoad(go);
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 10;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(2340, 1080);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f;
            go.AddComponent<GraphicRaycaster>();

            if (FindAnyObjectByType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem", typeof(EventSystem), typeof(InputSystemUIInputModule));
                es.GetComponent<InputSystemUIInputModule>().pointerBehavior = UIPointerBehavior.SingleUnifiedPointer;
                DontDestroyOnLoad(es);
            }

            var root = go.AddComponent<UiRoot>();
            root.Build((RectTransform)go.transform);
            return root;
        }

        private void Build(RectTransform canvas)
        {
            Instance = this;
            _paper = Kit.GraphPaper(canvas);
            _white = Kit.Panel(canvas, "White", Color.white);
            Kit.Fill((RectTransform)_white.transform);
            _white.gameObject.SetActive(false);
            Safe = Kit.Fill(Kit.Rect("Safe", canvas));
            Screens = Kit.Fill(Kit.Rect("Screens", Safe));
            Hud = Kit.Fill(Kit.Rect("HUD", Safe));
            Overlay = Kit.Fill(Kit.Rect("Overlay", canvas));
            ApplySafeArea();
        }

        private Rect _lastSafe;

        private void Update()
        {
            if (Screen.safeArea != _lastSafe) ApplySafeArea();
        }

        private void ApplySafeArea()
        {
            _lastSafe = Screen.safeArea;
            if (Screen.width <= 0 || Screen.height <= 0) return;
            var min = _lastSafe.position;
            var max = _lastSafe.position + _lastSafe.size;
            Safe.anchorMin = new Vector2(min.x / Screen.width, min.y / Screen.height);
            Safe.anchorMax = new Vector2(max.x / Screen.width, max.y / Screen.height);
            Safe.offsetMin = Safe.offsetMax = Vector2.zero;
        }

        /// <summary>The graph paper shows behind screens, not over the camera feed.</summary>
        public void ShowPaper(bool on)
        {
            _paper.gameObject.SetActive(on);
            _white.gameObject.SetActive(false);
        }

        /// <summary>The library and the loading screen sit on plain white.</summary>
        public void ShowWhite()
        {
            _paper.gameObject.SetActive(false);
            _white.gameObject.SetActive(true);
        }

        public RectTransform NewScreen(string name)
        {
            Kit.Clear(Screens);
            Kit.LastScreenChange = Time.unscaledTime;
            Kit.LastScreenFrame = Time.frameCount;
            return Kit.Fill(Kit.Rect(name, Screens));
        }

        public void ClearScreens() => Kit.Clear(Screens);

        // ---- dialogs ------------------------------------------------------------

        /// <summary>A confirmation: title, message, a cancel and a confirm.</summary>
        public RectTransform Confirm(string title, string body, string confirm, string cancel,
            Action onConfirm, Action onCancel = null)
        {
            var layer = Kit.Fill(Kit.Rect("Dialog", Overlay));
            Kit.Scrim(layer);
            var card = Kit.Card(layer, "Card", Theme.CardSolid);
            Kit.Place((RectTransform)card.transform, new Vector2(0.5f, 0.5f), new Vector2(1180, 0), Vector2.zero);
            Kit.Column(card.transform, 28, new RectOffset(72, 72, 64, 56));
            Kit.Fit(card);
            var t = Kit.Text(card.transform, title, Theme.HeadingSize, Theme.Bold);
            Kit.Fit(t);
            Kit.Rule(card.transform);
            if (!string.IsNullOrEmpty(body)) Kit.Fit(Kit.Text(card.transform, body, Theme.BodySize, Theme.Medium, Theme.InkSoft));
            var row = Kit.Rect("Buttons", card.transform);
            Kit.Row(row, 28, new RectOffset(0, 0, 20, 0), TextAnchor.MiddleRight).childForceExpandWidth = false;
            Kit.Size(row, -1, 140);
            Kit.Spacer(row);
            if (!string.IsNullOrEmpty(cancel))
            {
                var no = Kit.Wide(row, cancel, () => { Destroy(layer.gameObject); onCancel?.Invoke(); }, false);
                Kit.Size(no, 360, 120);
            }
            var yes = Kit.Wide(row, string.IsNullOrEmpty(confirm) ? "OK" : confirm, () => { Destroy(layer.gameObject); onConfirm?.Invoke(); });
            Kit.Size(yes, 420, 120);
            return layer;
        }

        public void Notice(string title, string body, string ok = "OK", Action done = null) =>
            Confirm(title, body, ok, null, done);

        /// <summary>The countdown card shown before moving on.</summary>
        public IEnumerator Countdown(string text, float seconds)
        {
            var layer = Kit.Fill(Kit.Rect("Countdown", Overlay));
            Kit.Scrim(layer, new Color(0, 0, 0, 0.25f));
            var card = Kit.Card(layer, "Card", Theme.CardSolid);
            Kit.Place((RectTransform)card.transform, new Vector2(0.5f, 0.5f), new Vector2(760, 420), Vector2.zero);
            var label = Kit.Text(card.transform, string.IsNullOrEmpty(text) ? "Moving on in..." : text, Theme.BodySize + 4, Theme.SemiBold,
                Theme.Ink, TextAlignmentOptions.Center);
            Kit.Place(label.rectTransform, new Vector2(0.5f, 1), new Vector2(700, 90), new Vector2(0, -70));
            var number = Kit.Text(card.transform, "", 170, Theme.Bold, Theme.Brand, TextAlignmentOptions.Center);
            Kit.Place(number.rectTransform, new Vector2(0.5f, 0), new Vector2(400, 220), new Vector2(0, 50));
            for (var s = Mathf.CeilToInt(Mathf.Max(1, seconds)); s > 0; s--)
            {
                number.text = s.ToString();
                yield return new WaitForSeconds(1f);
            }
            Destroy(layer.gameObject);
        }

        public void Toast(string text, float seconds = 2.6f)
        {
            if (_toast != null) Destroy(_toast.gameObject);
            var card = Kit.Card(Overlay, "Toast", new Color(0.15f, 0.15f, 0.15f, 0.92f), 36);
            _toast = (RectTransform)card.transform;
            Kit.Place(_toast, new Vector2(0.5f, 0), new Vector2(0, 0), new Vector2(0, 220));
            Kit.Row(card.transform, 0, new RectOffset(56, 56, 30, 30), TextAnchor.MiddleCenter);
            Kit.Fit(card, true, true);
            var t = Kit.Text(card.transform, text, Theme.BodySize - 4, Theme.SemiBold, Color.white, TextAlignmentOptions.Center);
            Kit.Fit(t, true, true);
            t.textWrappingMode = TextWrappingModes.NoWrap;
            StartCoroutine(HideToast(_toast, seconds));
        }

        private IEnumerator HideToast(RectTransform toast, float seconds)
        {
            yield return new WaitForSeconds(seconds);
            if (toast != null) Destroy(toast.gameObject);
        }

        // The loading screen: plain white, the wordmark top-left, "Loading Activity..."
        // bottom-right beside a turning red cube.
        public RectTransform Loading(string message = "Loading Activity...")
        {
            var layer = Kit.Fill(Kit.Rect("Loading", Overlay));
            var white = Kit.Panel(layer, "White", Color.white);
            Kit.Fill((RectTransform)white.transform);
            var lockup = Brand.Lockup(layer, 120);
            lockup.anchorMin = lockup.anchorMax = lockup.pivot = new Vector2(0, 1);
            lockup.anchoredPosition = new Vector2(110, -50);
            var cube = Kit.Icon(layer, "cube", 125, Theme.Brand);
            Kit.Place((RectTransform)cube.transform, new Vector2(1, 0), new Vector2(125, 125), new Vector2(-80, 80));
            ((RectTransform)cube.transform).pivot = new Vector2(0.5f, 0.5f);
            ((RectTransform)cube.transform).anchoredPosition = new Vector2(-150, 150);
            cube.gameObject.AddComponent<Tumble>();
            var t = Kit.Text(layer, message, 44, Theme.Bold, Theme.Ink, TextAlignmentOptions.MidlineRight);
            t.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Place(t.rectTransform, new Vector2(1, 0), new Vector2(1200, 125), new Vector2(-250, 88));
            return layer;
        }

        /// <summary>A full-screen busy cover with a message (loading an activity).</summary>
        public RectTransform Busy(string message)
        {
            var layer = Kit.Fill(Kit.Rect("Busy", Overlay));
            Kit.Scrim(layer, new Color(0.9f, 0.9f, 0.9f, 0.96f));
            var spinner = Kit.Icon(layer, "reset", 140, Theme.Brand);
            Kit.Place((RectTransform)spinner.transform, new Vector2(0.5f, 0.5f), new Vector2(140, 140), new Vector2(0, 80));
            spinner.gameObject.AddComponent<Spin>();
            var t = Kit.Text(layer, message, Theme.BodySize, Theme.SemiBold, Theme.Ink, TextAlignmentOptions.Center);
            Kit.Place(t.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1600, 120), new Vector2(0, -80));
            return layer;
        }
    }

    /// <summary>The loading cube turns a quarter at a time, pausing between turns.</summary>
    public class Tumble : MonoBehaviour
    {
        private void Update()
        {
            var t = Time.unscaledTime % 1.2f;
            var turn = Mathf.Floor(Time.unscaledTime / 1.2f);
            var k = Mathf.SmoothStep(0, 1, Mathf.Clamp01(t / 0.5f));
            transform.localRotation = Quaternion.Euler(0, 0, -90f * (turn + k));
        }
    }

    public class Spin : MonoBehaviour
    {
        private void Update() => transform.Rotate(0, 0, -260f * Time.unscaledDeltaTime);
    }
}
