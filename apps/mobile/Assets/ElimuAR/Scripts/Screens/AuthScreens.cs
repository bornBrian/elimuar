using System;
using System.Collections;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ElimuAR
{
    public static class Brand
    {
        public static RectTransform Lockup(Transform parent, float height, Color? ink = null)
        {
            var t = Kit.Text(parent, "Elimu<color=#E2231A>AR</color>", height * 0.78f, Theme.Bold, ink ?? Theme.Ink, TextAlignmentOptions.MidlineLeft);
            t.name = "Wordmark";
            t.characterSpacing = -3;
            t.textWrappingMode = TextWrappingModes.NoWrap;
            t.rectTransform.sizeDelta = new Vector2(height * 3.4f, height);
            Kit.Size(t, height * 3.4f, height);
            return t.rectTransform;
        }
    }

    // The opening animation (about 3.8 s), with its sound built as one clip on the same clock so every
    // sound lands on its beat.
    public class SplashMotion : MonoBehaviour
    {
        public const float Length = 3.8f;

        private class Cube
        {
            public RectTransform Root;
            public Image[] Edges;
            public Vector2 Center, Drift;
            public float Size, Yaw, Pitch, YawSpeed, Delay, Thickness;
            public Color Color;
        }

        private static readonly Vector3[] Corners =
        {
            new Vector3(-1, -1, -1), new Vector3(1, -1, -1), new Vector3(1, 1, -1), new Vector3(-1, 1, -1),
            new Vector3(-1, -1, 1), new Vector3(1, -1, 1), new Vector3(1, 1, 1), new Vector3(-1, 1, 1),
        };
        private static readonly int[,] EdgePairs =
        {
            { 0, 1 }, { 1, 2 }, { 2, 3 }, { 3, 0 }, { 4, 5 }, { 5, 6 }, { 6, 7 }, { 7, 4 }, { 0, 4 }, { 1, 5 }, { 2, 6 }, { 3, 7 },
        };

        private Image _backdrop, _veil;
        private RectTransform _grid;
        private readonly System.Collections.Generic.List<RectTransform> _gridLines = new System.Collections.Generic.List<RectTransform>();
        private readonly System.Collections.Generic.List<Cube> _cubes = new System.Collections.Generic.List<Cube>();
        private Cube _hero;
        private TMP_Text _elimu, _ar, _tag;
        private readonly System.Collections.Generic.List<(RectTransform dash, Vector2 dir, float speed)> _dashes =
            new System.Collections.Generic.List<(RectTransform, Vector2, float)>();
        private float _t;
        private const float ElimuLeft = -170, ArRight = 330, MarkY = 40;

        public void Configure()
        {
            var root = (RectTransform)transform;
            _backdrop = Kit.Panel(root, "Backdrop", new Color(0.55f, 0.55f, 0.56f));
            Kit.Fill(_backdrop.rectTransform);

            _grid = Kit.Fill(Kit.Rect("Grid", root));
            var line = new Color(0.9f, 0.91f, 0.93f, 1f);
            for (var x = -1200; x <= 1200; x += 150) _gridLines.Add(GridLine(new Vector2(x, 0), new Vector2(2, 1300), line));
            for (var y = -600; y <= 600; y += 150) _gridLines.Add(GridLine(new Vector2(0, y), new Vector2(2500, 2), line));

            var random = new System.Random(11);
            var grey = new Color(0.72f, 0.73f, 0.76f);
            for (var i = 0; i < 9; i++)
            {
                var side = i % 2 == 0 ? -1 : 1;
                var center = new Vector2(side * (520 + random.Next(520)), -420 + random.Next(840));
                _cubes.Add(MakeCube(root, center, 120 + random.Next(200), grey, 2.5f, 0.7f + i * 0.06f,
                    (float)random.NextDouble() * 90, 18 + random.Next(20), (random.NextDouble() < 0.5 ? -1 : 1) * (14 + random.Next(16)),
                    new Vector2(side * (10 + random.Next(20)), -8 + random.Next(16))));
            }
            _hero = MakeCube(root, new Vector2(0, MarkY), 300, Theme.Brand, 6f, 0.45f, 20, 24, 70, Vector2.zero);

            _elimu = Kit.Text(root, "Elimu", 210, Theme.Bold, Theme.Ink, TextAlignmentOptions.Center);
            _elimu.characterSpacing = -3;
            _elimu.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Place(_elimu.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(900, 260), new Vector2(0, MarkY));
            _ar = Kit.Text(root, "AR", 210, Theme.Bold, Theme.Brand, TextAlignmentOptions.Center);
            _ar.characterSpacing = -3;
            _ar.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Place(_ar.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(400, 260), new Vector2(ArRight, MarkY));
            _tag = Kit.Text(root, "Augmented reality practicals for every classroom", 40, Theme.Medium, Theme.InkSoft, TextAlignmentOptions.Center);
            Kit.Place(_tag.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1800, 80), new Vector2(0, -150));

            var colors = new[] { Theme.Brand, Theme.Ink, Theme.InkSoft };
            for (var i = 0; i < 22; i++)
            {
                var angle = i / 22f * Mathf.PI * 2 + (float)random.NextDouble() * 0.2f;
                var dir = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle) * 0.7f);
                var dash = Kit.Panel(root, "Dash", colors[i % colors.Length], 5);
                var rt = dash.rectTransform;
                rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = new Vector2(40 + random.Next(30), 10);
                rt.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg);
                dash.color = Clear(dash.color);
                _dashes.Add((rt, dir, 260 + random.Next(220)));
            }

            _veil = Kit.Panel(root, "Veil", new Color(1, 1, 1, 0));
            Kit.Fill(_veil.rectTransform);
            _veil.raycastTarget = false;

            Apply(0);
            SplashSound.Play();
        }

        private RectTransform GridLine(Vector2 at, Vector2 size, Color color)
        {
            var img = Kit.Panel(_grid, "Line", Clear(color));
            img.raycastTarget = false;
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = at;
            rt.sizeDelta = size;
            return rt;
        }

        private Cube MakeCube(RectTransform parent, Vector2 center, float size, Color color, float thickness, float delay,
            float yaw, float pitch, float yawSpeed, Vector2 drift)
        {
            var root = Kit.Rect("Cube", parent);
            root.anchorMin = root.anchorMax = new Vector2(0.5f, 0.5f);
            root.sizeDelta = Vector2.zero;
            var cube = new Cube
            {
                Root = root, Center = center, Size = size, Color = color, Thickness = thickness, Delay = delay,
                Yaw = yaw, Pitch = pitch, YawSpeed = yawSpeed, Drift = drift, Edges = new Image[12],
            };
            for (var i = 0; i < 12; i++)
            {
                var img = Kit.Panel(root, "Edge", Clear(color));
                img.rectTransform.anchorMin = img.rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
                img.raycastTarget = false;
                cube.Edges[i] = img;
            }
            return cube;
        }

        private static Color Clear(Color c) => new Color(c.r, c.g, c.b, 0);
        private static float Ease(float x) => 1 - Mathf.Pow(1 - Mathf.Clamp01(x), 3);
        private static float Phase(float t, float start, float length) => Mathf.Clamp01((t - start) / length);

        /// <summary>Projects the cube's 12 edges at its current turn and draws each as a thin bar.</summary>
        private static void DrawCube(Cube c, float scale, float alpha, Vector2 offset)
        {
            c.Root.anchoredPosition = c.Center + offset;
            var rot = Quaternion.Euler(c.Pitch, c.Yaw, 0);
            var half = c.Size * 0.5f * scale;
            var focal = c.Size * 3.2f;
            var points = new Vector2[8];
            for (var i = 0; i < 8; i++)
            {
                var p = rot * (Corners[i] * half);
                var k = focal / (focal + p.z);
                points[i] = new Vector2(p.x * k, p.y * k);
            }
            for (var e = 0; e < 12; e++)
            {
                var a = points[EdgePairs[e, 0]];
                var b = points[EdgePairs[e, 1]];
                var rt = c.Edges[e].rectTransform;
                rt.anchoredPosition = (a + b) * 0.5f;
                rt.sizeDelta = new Vector2((b - a).magnitude + c.Thickness, c.Thickness);
                rt.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(b.y - a.y, b.x - a.x) * Mathf.Rad2Deg);
                var col = c.Color;
                col.a = alpha;
                c.Edges[e].color = col;
            }
        }

        private void Update()
        {
            var dt = Time.unscaledDeltaTime;
            _t += dt;
            Apply(dt);
        }

        private void Apply(float dt)
        {
            var t = _t;

            // Grey to white.
            _backdrop.color = Color.Lerp(new Color(0.55f, 0.55f, 0.56f), Color.white, Ease(Phase(t, 0.05f, 0.5f)));

            // The grid draws itself out from the centre.
            var grid = Ease(Phase(t, 0.6f, 0.9f));
            foreach (var line in _gridLines)
            {
                line.localScale = line.sizeDelta.x > line.sizeDelta.y ? new Vector3(grid, 1, 1) : new Vector3(1, grid, 1);
                var img = line.GetComponent<Image>();
                var c = img.color;
                c.a = grid;
                img.color = c;
            }

            // Grey cubes drift in behind.
            foreach (var cube in _cubes)
            {
                var appear = Ease(Phase(t, cube.Delay, 0.7f));
                cube.Yaw += cube.YawSpeed * dt;
                DrawCube(cube, Mathf.Lerp(0.6f, 1f, appear), appear * 0.55f, cube.Drift * t);
            }

            // The hero cube unfolds, turns, then collapses into "AR".
            var unfold = Ease(Phase(t, 0.45f, 0.55f));
            var collapse = Ease(Phase(t, 1.45f, 0.25f));
            _hero.Yaw += Mathf.Lerp(70f, 260f, collapse) * dt;
            DrawCube(_hero, unfold * (1 - collapse * 0.75f), unfold * (1 - collapse), Vector2.Lerp(Vector2.zero, new Vector2(ArRight, 0), collapse));

            // Out to white at the end, the marks easing back a little.
            var exit = Ease(Phase(t, 3.3f, 0.45f));
            _veil.color = new Color(1, 1, 1, exit);
            var shrink = Mathf.Lerp(1f, 0.94f, exit);

            // "Elimu" settles in at the centre, then makes room for "AR".
            var settle = Ease(Phase(t, 0.1f, 0.6f));
            var room = Ease(Phase(t, 1.5f, 0.45f));
            _elimu.alpha = settle;
            _elimu.rectTransform.localScale = Vector3.one * (Mathf.Lerp(0.86f, 1f, settle) * shrink);
            _elimu.rectTransform.anchoredPosition = new Vector2(Mathf.Lerp(0, ElimuLeft, room), MarkY);

            // "AR" pops in with a spring.
            var pop = Phase(t, 1.6f, 0.5f);
            var spring = pop <= 0 ? 0 : 1 + Mathf.Sin(pop * Mathf.PI * 1.5f) * (1 - pop) * 0.22f;
            _ar.alpha = Mathf.Clamp01(pop * 3);
            _ar.rectTransform.localScale = Vector3.one * (Ease(pop) * spring * shrink);
            _ar.rectTransform.anchoredPosition = new Vector2(Mathf.Lerp(ArRight - 40, ArRight, Ease(pop)), MarkY);

            // The burst leaves from "AR".
            var burst = Phase(t, 1.62f, 0.7f);
            foreach (var (dash, dir, speed) in _dashes)
            {
                dash.anchoredPosition = new Vector2(ArRight, MarkY) + dir * (150 + speed * Ease(burst));
                var img = dash.GetComponent<Image>();
                var c = img.color;
                c.a = burst <= 0 ? 0 : Mathf.Clamp01(1.3f - burst * 1.3f);
                img.color = c;
            }

            _tag.alpha = Ease(Phase(t, 2.2f, 0.5f));
        }
    }

    // The splash's sound, made in code as one clip whose events sit at the same times as the animation's
    // beats, so the two can never drift apart.
    public static class SplashSound
    {
        private const int Rate = 44100;

        public static void Play()
        {
            if (Settings.Muted) return;
            var data = new float[(int)(Rate * SplashMotion.Length)];
            Swell(data, 0.0f);
            Whoosh(data, 0.45f, 0.95f);
            Pop(data, 1.6f);
            Bell(data, 1.62f, 659.25f, 0.20f);
            Bell(data, 1.74f, 783.99f, 0.20f);
            Bell(data, 1.86f, 1046.5f, 0.22f);
            Bell(data, 2.20f, 2093.0f, 0.05f);
            Bell(data, 2.28f, 2637.0f, 0.04f);
            var peak = 0.001f;
            foreach (var v in data) peak = Mathf.Max(peak, Mathf.Abs(v));
            for (var i = 0; i < data.Length; i++) data[i] = data[i] / peak * 0.85f;

            var clip = AudioClip.Create("splash", data.Length, 1, Rate, false);
            clip.SetData(data, 0);
            var go = new GameObject("SplashSound");
            var source = go.AddComponent<AudioSource>();
            source.volume = 0.8f;
            source.PlayOneShot(clip);
            UnityEngine.Object.Destroy(go, SplashMotion.Length + 0.5f);
        }

        /// <summary>A low, soft swell under the opening.</summary>
        private static void Swell(float[] d, float at)
        {
            var s0 = (int)(at * Rate);
            for (var i = 0; i < Rate * 1.1f && s0 + i < d.Length; i++)
            {
                var t = i / (float)Rate;
                var f = Mathf.Lerp(110f, 70f, t / 1.1f);
                var env = Mathf.Clamp01(t * 4f) * Mathf.Exp(-t * 2.6f);
                d[s0 + i] += Mathf.Sin(2 * Mathf.PI * f * t) * env * 0.35f;
            }
        }

        /// <summary>Filtered noise rising and falling while the cube unfolds.</summary>
        private static void Whoosh(float[] d, float at, float length)
        {
            var s0 = (int)(at * Rate);
            var random = new System.Random(5);
            float low = 0;
            for (var i = 0; i < Rate * length && s0 + i < d.Length; i++)
            {
                var u = i / (Rate * length);
                var cutoff = Mathf.Lerp(0.02f, 0.18f, Mathf.Sin(u * Mathf.PI));
                var noise = (float)random.NextDouble() * 2 - 1;
                low += (noise - low) * cutoff;
                d[s0 + i] += low * Mathf.Sin(u * Mathf.PI) * 0.6f;
            }
        }

        /// <summary>A short, round pop as "AR" lands.</summary>
        private static void Pop(float[] d, float at)
        {
            var s0 = (int)(at * Rate);
            for (var i = 0; i < Rate * 0.12f && s0 + i < d.Length; i++)
            {
                var t = i / (float)Rate;
                var f = Mathf.Lerp(900f, 300f, t / 0.12f);
                d[s0 + i] += Mathf.Sin(2 * Mathf.PI * f * t) * Mathf.Exp(-t * 40f) * 0.5f;
            }
        }

        /// <summary>A bell note: a sine with a bright partial and a soft decay.</summary>
        private static void Bell(float[] d, float at, float freq, float gain)
        {
            var s0 = (int)(at * Rate);
            for (var i = 0; i < Rate * 1.5f && s0 + i < d.Length; i++)
            {
                var t = i / (float)Rate;
                var env = Mathf.Exp(-t * 3.0f) * Mathf.Clamp01(t * 300f);
                d[s0 + i] += (Mathf.Sin(2 * Mathf.PI * freq * t) + 0.35f * Mathf.Sin(2 * Mathf.PI * freq * 2.01f * t)
                              + 0.12f * Mathf.Sin(2 * Mathf.PI * freq * 3.02f * t)) * env * gain;
            }
        }
    }

    public static class AuthScreens
    {
        private static App App => App.Instance;
        private static UiRoot Ui => UiRoot.Instance;

        // ---- splash -------------------------------------------------------------

        public static void Splash()
        {
            Ui.ShowWhite();
            var screen = Ui.NewScreen("Splash");
            screen.gameObject.AddComponent<SplashMotion>().Configure();
        }

        // ---- first launch -------------------------------------------------------

        /// <summary>The first-run welcome and its adult-supervision notice.</summary>
        public static void Welcome(Action done)
        {
            Ui.ShowWhite();
            var screen = Ui.NewScreen("Welcome");
            var card = Kit.Card(screen, "Card");
            Kit.Place((RectTransform)card.transform, new Vector2(0.5f, 0.5f), new Vector2(1500, 0), Vector2.zero);
            Kit.Column(card.transform, 30, new RectOffset(90, 90, 70, 70));
            Kit.Fit(card);
            Brand.Lockup(card.transform, 120);
            Kit.Fit(Kit.Text(card.transform, "Welcome to ElimuAR!", Theme.TitleSize - 6, Theme.Bold));
            Kit.Rule(card.transform);
            Kit.Fit(Kit.Text(card.transform,
                "ElimuAR puts science you can walk around on your desk. Learners should use ElimuAR with an adult watching.\n\n" +
                "Be aware of your surroundings while using augmented reality. Stay clear of stairs, roads and anything you could bump into. " +
                "Some activities need a flat, open surface.",
                Theme.BodySize, Theme.Medium, Theme.InkSoft));
            var row = Kit.Rect("Buttons", card.transform);
            Kit.Row(row, 0, null, TextAnchor.MiddleRight);
            Kit.Size(row, -1, 130);
            Kit.Spacer(row);
            Kit.Size(Kit.Wide(row, "I Understand", () => { Session.WelcomeSeen = true; done(); }, true, "next"), 520, 124);
        }

        // ---- shared layout --------------------------------------------------------

        private static Texture2D _hero, _shade;

        private static Texture2D Hero => _hero != null ? _hero : _hero = Resources.Load<Texture2D>("Brand/hero");

        private static Texture2D Shade()
        {
            if (_shade != null) return _shade;
            _shade = new Texture2D(1, 256, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (var y = 0; y < 256; y++)
            {
                var t = 1 - y / 255f;
                _shade.SetPixel(0, y, new Color(0.04f, 0.08f, 0.14f, Mathf.SmoothStep(0, 0.78f, Mathf.Clamp01((t - 0.45f) / 0.55f))));
            }
            _shade.Apply();
            return _shade;
        }

        private static RectTransform FormScreen(string name, string title, string subtitle, out RectTransform form, Action back = null)
        {
            Ui.ShowWhite();
            var screen = Ui.NewScreen(name);

            var art = Kit.Card(screen, "Art", Theme.Ink, 64);
            var artRt = (RectTransform)art.transform;
            artRt.anchorMin = Vector2.zero;
            artRt.anchorMax = new Vector2(0.5f, 1);
            artRt.offsetMin = new Vector2(40, 40);
            artRt.offsetMax = new Vector2(-20, -40);
            art.gameObject.AddComponent<Mask>().showMaskGraphic = true;
            if (Hero != null)
            {
                var photo = Kit.Rect("Photo", art.transform).gameObject.AddComponent<RawImage>();
                photo.texture = Hero;
                photo.raycastTarget = false;
                Kit.Fill(photo.rectTransform);
                var fit = photo.gameObject.AddComponent<AspectRatioFitter>();
                fit.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent;
                fit.aspectRatio = (float)Hero.width / Hero.height;
            }
            var shade = Kit.Rect("Shade", art.transform).gameObject.AddComponent<RawImage>();
            shade.texture = Shade();
            shade.raycastTarget = false;
            Kit.Fill(shade.rectTransform);
            var pitch = Kit.Text(art.transform, "The science lab,\non every desk.", 76, Theme.Bold, Color.white, TextAlignmentOptions.BottomLeft);
            pitch.characterSpacing = -2;
            pitch.lineSpacing = -12;
            Kit.Place(pitch.rectTransform, Vector2.zero, new Vector2(900, 200), new Vector2(64, 118));
            var line = Kit.Text(art.transform, "AR practicals for Tanzanian secondary schools", 34, Theme.Medium, new Color(1, 1, 1, 0.82f), TextAlignmentOptions.BottomLeft);
            Kit.Place(line.rectTransform, Vector2.zero, new Vector2(1000, 50), new Vector2(64, 60));

            var side = Kit.Rect("Side", screen);
            side.anchorMin = new Vector2(0.5f, 0);
            side.anchorMax = Vector2.one;
            side.offsetMin = new Vector2(20, 0);
            side.offsetMax = Vector2.zero;

            var lockup = Brand.Lockup(side, 96);
            lockup.anchorMin = lockup.anchorMax = lockup.pivot = new Vector2(0, 1);
            lockup.anchoredPosition = new Vector2(150, -52);

            var corner = Kit.Rect("Corner", side);
            Kit.Place(corner, Vector2.one, new Vector2(600, 96), new Vector2(-70, -52));
            Kit.Row(corner, 18, null, TextAnchor.MiddleRight);
            if (back != null) TextLink(corner, "back", "Back", () => back());
            TextLink(corner, "settings", "Server", ServerScreen);

            var host = Kit.Rect("FormHost", side);
            host.anchorMin = Vector2.zero;
            host.anchorMax = Vector2.one;
            host.offsetMin = new Vector2(150, 30);
            host.offsetMax = new Vector2(-150, -170);
            var content = Kit.ScrollList(host, 0, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            var column = Kit.Rect("Form", content);
            Kit.Column(column, 30, new RectOffset(0, 0, 40, 40));
            Kit.Fit(column);
            var head = Kit.Text(column, title, 92, Theme.Bold, Theme.Ink);
            head.characterSpacing = -2;
            Kit.Fit(head);
            if (!string.IsNullOrEmpty(subtitle))
                Kit.Fit(Kit.Text(column, subtitle, Theme.BodySize - 2, Theme.Medium, Theme.InkSoft));
            var gap = Kit.Rect("Gap", column);
            Kit.Size(gap, -1, 14);
            form = column;
            return screen;
        }

        private static void TextLink(Transform parent, string glyph, string label, Action click)
        {
            var bg = Kit.Card(parent, "Link-" + label, Theme.Tile, 40);
            var row = Kit.Rect("Row", bg.transform);
            Kit.Fill(row);
            Kit.Row(row, 14, new RectOffset(30, 34, 0, 0), TextAnchor.MiddleCenter);
            Kit.Size(Kit.Icon(row, glyph, 40, Theme.Ink), 40, 40);
            var t = Kit.Text(row, label, 36, Theme.SemiBold, Theme.Ink);
            t.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Fit(t, true, true);
            Kit.Fit(bg, false, true);
            Kit.Size(bg, -1, 84);
            Kit.Clickable(bg.gameObject, () => click());
        }

        private static TextMeshProUGUI Status(Transform form)
        {
            var t = Kit.Text(form, "", Theme.SmallSize + 2, Theme.SemiBold, Theme.Wrong);
            Kit.Fit(t);
            t.gameObject.SetActive(false);
            return t;
        }

        private static void Say(TextMeshProUGUI status, string message, bool error = true)
        {
            status.text = message ?? "";
            status.color = error ? Theme.Wrong : Theme.BrandDark;
            status.gameObject.SetActive(!string.IsNullOrEmpty(message));
        }

        private static void Segmented(Transform parent, string[] labels, int selected, Action<int> pick)
        {
            var bar = Kit.Card(parent, "Segments", Theme.Hex(0xE9E9E9), 30);
            Kit.Size(bar, -1, 112);
            var row = Kit.Row(bar.transform, 8, new RectOffset(8, 8, 8, 8));
            row.childForceExpandWidth = true;
            row.childForceExpandHeight = true;
            for (var i = 0; i < labels.Length; i++)
            {
                var index = i;
                var seg = Kit.Card(bar.transform, labels[i], i == selected ? Color.white : new Color(1, 1, 1, 0), 24);
                var t = Kit.Text(seg.transform, labels[i], Theme.LabelSize, i == selected ? Theme.Bold : Theme.Medium,
                    i == selected ? Theme.Ink : Theme.InkSoft, TextAlignmentOptions.Center);
                Kit.Fill(t.rectTransform);
                Kit.Clickable(seg.gameObject, () => pick(index));
            }
        }

        // ---- sign in ----------------------------------------------------------------

        public static void SignIn(bool student = true)
        {
            FormScreen("SignIn", "Welcome back", student ? "Sign in with your admission number." : "Sign in with your school email.", out var form);
            Segmented(form, new[] { "Student", "Teacher" }, student ? 0 : 1, i => SignIn(i == 0));
            var id = Kit.Field(form, student ? "Admission number" : "Email");
            id.text = PlayerPrefs.GetString(student ? "lastAdmission" : "lastEmail", "");
            var secret = Kit.Field(form, student ? "PIN or password" : "Password", true);
            var status = Status(form);
            Button go = null;
            go = Kit.Wide(form, "Sign In", () =>
            {
                var who = id.text.Trim();
                var password = secret.text;
                if (who.Length == 0 || password.Length == 0)
                {
                    Say(status, student ? "Enter your admission number and your PIN or password." : "Enter your email and password.");
                    return;
                }
                Say(status, "Signing in...", false);
                go.interactable = false;
                var body = student
                    ? new JObject { ["studentIdentifier"] = who, ["password"] = password }
                    : new JObject { ["identifier"] = who, ["password"] = password };
                App.Run(Api.PostAnonymous(student ? "/api/auth/student/login" : "/api/auth/login", body, data =>
                {
                    go.interactable = true;
                    PlayerPrefs.SetString(student ? "lastAdmission" : "lastEmail", who);
                    Session.SignIn((JObject)data);
                    var firstPin = student && Regex.IsMatch(password, "^\\d{4,6}$");
                    var flagged = data["user"]?.Value<bool?>("mustChangePassword") ?? false;
                    if (firstPin || flagged) SetPassword(password, firstPin);
                    else App.EnterHome();
                }, f =>
                {
                    go.interactable = true;
                    Say(status, f.Status == 401 ? (student
                        ? "That admission number and PIN or password do not match."
                        : "That email and password do not match.") : f.Message);
                }));
            }, true, "next");
            if (student)
            {
                Kit.Fit(Kit.Text(form, "First time? Use the 4-digit PIN your teacher gave you.", Theme.SmallSize, Theme.Medium, Theme.InkSoft));
            }
            else
            {
                Kit.Wide(form, "New teacher? Create your account", () => TeacherSignUp(), false);
                Kit.Wide(form, "Forgot password?", () => ForgotPassword(), false);
            }
        }

        public static void SetPassword(string current, bool firstPin)
        {
            FormScreen("SetPassword", "Choose a password", null, out var form, () => { Session.SignOut(); SignIn(); });
            Kit.Fit(Kit.Text(form, firstPin
                ? "Your PIN is for the first sign-in only. Choose the password you will use from now on."
                : "Your school asked you to choose a new password.", Theme.BodySize - 4, Theme.Medium, Theme.InkSoft));
            var a = Kit.Field(form, "New password (8 or more characters)", true);
            var b = Kit.Field(form, "Type it again", true);
            var status = Status(form);
            Kit.Wide(form, "Save Password", () =>
            {
                if (a.text.Length < 8) { Say(status, "Use at least 8 characters."); return; }
                if (a.text != b.text) { Say(status, "The two passwords do not match."); return; }
                Say(status, "Saving...", false);
                App.Run(Api.Post("/api/auth/password/change",
                    new JObject { ["currentPassword"] = current, ["newPassword"] = a.text, ["refreshToken"] = Session.RefreshToken },
                    _ => App.EnterHome(), f => Say(status, f.Message)));
            }, true, "done");
        }

        public static void TeacherSignUp()
        {
            FormScreen("SignUp", "Create your account", "For teachers your school has registered.", out var form, () => SignIn(false));
            Kit.Fit(Kit.Text(form, "Use the email your school registered for you. We will send a code to it.", Theme.BodySize - 6,
                Theme.Medium, Theme.InkSoft));
            var email = Kit.Field(form, "Email");
            var names = Kit.Rect("Names", form);
            Kit.Row(names, 20).childForceExpandWidth = true;
            Kit.Size(names, -1, 116);
            var first = Kit.Field(names, "First name");
            var last = Kit.Field(names, "Last name");
            Kit.Size(first, flexW: 1);
            Kit.Size(last, flexW: 1);
            var status = Status(form);
            string token = null;
            Kit.Wide(form, "Send Code", () =>
            {
                if (email.text.Trim().Length == 0 || first.text.Trim().Length == 0 || last.text.Trim().Length == 0)
                {
                    Say(status, "Enter your email, first name and last name.");
                    return;
                }
                Say(status, "Sending a code to " + email.text.Trim() + "...", false);
                App.Run(Api.PostAnonymous("/api/auth/register/verify",
                    new JObject { ["email"] = email.text.Trim(), ["firstName"] = first.text.Trim(), ["lastName"] = last.text.Trim() },
                    _ => Say(status, "A code is on its way. Enter it below.", false), f => Say(status, f.Message)));
            }, false);
            var code = Kit.Field(form, "Code from the email", false, true);
            Kit.Wide(form, "Verify Code", () =>
            {
                Say(status, "Checking the code...", false);
                App.Run(Api.PostAnonymous("/api/auth/register/verify-code",
                    new JObject { ["email"] = email.text.Trim(), ["code"] = code.text.Trim() },
                    data =>
                    {
                        token = (string)data["registrationToken"];
                        var school = data["account"]?["schoolName"]?.ToString();
                        Say(status, "Code accepted" + (string.IsNullOrEmpty(school) ? "" : " for " + school) + ". Choose your password.", false);
                    }, f => Say(status, f.Message)));
            }, false);
            var pass = Kit.Field(form, "Password (8 or more characters)", true);
            Kit.Wide(form, "Create Account", () =>
            {
                if (token == null) { Say(status, "Verify the emailed code first."); return; }
                if (pass.text.Length < 8) { Say(status, "Use at least 8 characters."); return; }
                Say(status, "Creating your account...", false);
                App.Run(Api.PostAnonymous("/api/auth/register/complete",
                    new JObject { ["registrationToken"] = token, ["password"] = pass.text },
                    data => { Session.SignIn((JObject)data); App.EnterHome(); }, f => Say(status, f.Message)));
            }, true, "done");
        }

        public static void ForgotPassword()
        {
            FormScreen("Forgot", "Reset your password", null, out var form, () => SignIn(false));
            Kit.Fit(Kit.Text(form, "Enter your email. We will send a code you can use to choose a new password.", Theme.BodySize - 6,
                Theme.Medium, Theme.InkSoft));
            var email = Kit.Field(form, "Email");
            var status = Status(form);
            Kit.Wide(form, "Send Code", () =>
            {
                App.Run(Api.PostAnonymous("/api/auth/password/request", new JObject { ["identifier"] = email.text.Trim(), ["channel"] = "email" },
                    _ => Say(status, "If that email has an account, a code is on its way.", false), f => Say(status, f.Message)));
            }, false);
            var code = Kit.Field(form, "Code from the email", false, true);
            var pass = Kit.Field(form, "New password (8 or more characters)", true);
            Kit.Wide(form, "Save New Password", () =>
            {
                if (pass.text.Length < 8) { Say(status, "Use at least 8 characters."); return; }
                App.Run(Api.PostAnonymous("/api/auth/password/verify",
                    new JObject { ["identifier"] = email.text.Trim(), ["code"] = code.text.Trim() },
                    data =>
                    {
                        var resetToken = (string)data["resetToken"] ?? (string)data["token"];
                        App.Run(Api.PostAnonymous("/api/auth/password/reset",
                            new JObject { ["resetToken"] = resetToken, ["newPassword"] = pass.text },
                            _ => { Ui.Toast("Password changed. Sign in with it now."); SignIn(false); },
                            f => Say(status, f.Message)));
                    }, f => Say(status, f.Message)));
            }, true, "done");
        }

        // ---- server -------------------------------------------------------------------

        public static void ServerScreen()
        {
            FormScreen("Server", "Server", null, out var form, App.Back);
            Kit.Fit(Kit.Text(form, "The address of your school's ElimuAR server, for example http://192.168.137.1:4000",
                Theme.BodySize - 6, Theme.Medium, Theme.InkSoft));
            var url = Kit.Field(form, Session.DefaultServer);
            url.text = Session.Server;
            var status = Status(form);
            Kit.Wide(form, "Save and Test", () =>
            {
                var value = url.text.Trim().TrimEnd('/');
                if (!value.StartsWith("http://") && !value.StartsWith("https://")) value = "http://" + value;
                Session.Server = value;
                Say(status, "Testing " + value + "...", false);
                App.Run(Api.Get("/api/health", _ => Say(status, "Connected. ElimuAR will use " + value + ".", false),
                    f => Say(status, f.Message)));
            }, true, "wifi");
        }
    }
}
