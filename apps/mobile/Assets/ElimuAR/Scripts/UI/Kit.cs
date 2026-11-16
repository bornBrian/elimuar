using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace ElimuAR
{
    // Builds the app's UI from code: rects, frosted cards, the glyph-over-word tiles, wide buttons, fields,
    // lists, the graph-paper backdrop and the score ring.
    public static class Kit
    {
        private static readonly Dictionary<int, Sprite> Rounded = new Dictionary<int, Sprite>();
        private static Sprite _ring, _circle, _paper;

        /// <summary>When the screen last changed; taps landing right after are the old screen's.</summary>
        public static float LastScreenChange = -10f;
        public static int LastScreenFrame = -100;

        // ---- primitives -------------------------------------------------------

        public static RectTransform Rect(string name, Transform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = 5;
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            return rt;
        }

        public static RectTransform Fill(RectTransform rt, float inset = 0)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(inset, inset);
            rt.offsetMax = new Vector2(-inset, -inset);
            return rt;
        }

        /// <summary>Places a rect by anchor corner, size and offset from that corner.</summary>
        public static RectTransform Place(RectTransform rt, Vector2 anchor, Vector2 size, Vector2 offset)
        {
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = anchor;
            rt.sizeDelta = size;
            rt.anchoredPosition = offset;
            return rt;
        }

        public static Sprite RoundedSprite(int radius)
        {
            radius = Mathf.Clamp(radius, 2, 120);
            if (Rounded.TryGetValue(radius, out var s)) return s;
            var size = radius * 2 + 4;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, name = "rounded" + radius };
            var px = new Color32[size * size];
            var c = (size - 1) / 2f;
            for (var y = 0; y < size; y++)
            for (var x = 0; x < size; x++)
            {
                var dx = Mathf.Max(0, Mathf.Abs(x - c) - (c - radius));
                var dy = Mathf.Max(0, Mathf.Abs(y - c) - (c - radius));
                var d = Mathf.Sqrt(dx * dx + dy * dy) - radius;
                px[y * size + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(0.5f - d) * 255));
            }
            tex.SetPixels32(px);
            tex.Apply();
            s = Sprite.Create(tex, new UnityEngine.Rect(0, 0, size, size), new Vector2(0.5f, 0.5f), 100, 0,
                SpriteMeshType.FullRect, new Vector4(radius + 1, radius + 1, radius + 1, radius + 1));
            Rounded[radius] = s;
            return s;
        }

        public static Image Panel(Transform parent, string name, Color color, float radius = 0)
        {
            var rt = Rect(name, parent);
            var img = rt.gameObject.AddComponent<Image>();
            img.color = color;
            if (radius > 0)
            {
                img.sprite = RoundedSprite(Mathf.RoundToInt(radius));
                img.type = Image.Type.Sliced;
            }
            return img;
        }

        public static TextMeshProUGUI Text(Transform parent, string text, float size, TMP_FontAsset font = null,
            Color? color = null, TextAlignmentOptions align = TextAlignmentOptions.TopLeft)
        {
            var rt = Rect("Text", parent);
            var t = rt.gameObject.AddComponent<TextMeshProUGUI>();
            t.font = font ?? Theme.Medium;
            t.fontSize = size;
            t.color = color ?? Theme.Ink;
            t.alignment = align;
            t.text = text;
            t.textWrappingMode = TextWrappingModes.Normal;
            t.richText = true;
            t.raycastTarget = false;
            t.overflowMode = TextOverflowModes.Overflow;
            return t;
        }

        public static Image Icon(Transform parent, string glyph, float size, Color color)
        {
            var img = Panel(parent, "Icon-" + glyph, color);
            img.sprite = Icons.Get(glyph);
            img.preserveAspect = true;
            img.raycastTarget = false;
            ((RectTransform)img.transform).sizeDelta = new Vector2(size, size);
            return img;
        }

        // ---- layout helpers ---------------------------------------------------

        public static VerticalLayoutGroup Column(Transform target, float spacing, RectOffset padding = null,
            TextAnchor align = TextAnchor.UpperLeft)
        {
            var v = target.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = spacing;
            v.padding = padding ?? new RectOffset();
            v.childAlignment = align;
            v.childControlHeight = true;
            v.childControlWidth = true;
            v.childForceExpandHeight = false;
            v.childForceExpandWidth = true;
            return v;
        }

        public static HorizontalLayoutGroup Row(Transform target, float spacing, RectOffset padding = null,
            TextAnchor align = TextAnchor.MiddleLeft)
        {
            var h = target.gameObject.AddComponent<HorizontalLayoutGroup>();
            h.spacing = spacing;
            h.padding = padding ?? new RectOffset();
            h.childAlignment = align;
            h.childControlHeight = true;
            h.childControlWidth = true;
            h.childForceExpandHeight = false;
            h.childForceExpandWidth = false;
            return h;
        }

        public static LayoutElement Size(Component c, float width = -1, float height = -1, float flexW = -1, float flexH = -1)
        {
            var le = c.GetComponent<LayoutElement>() ?? c.gameObject.AddComponent<LayoutElement>();
            if (width >= 0) { le.preferredWidth = width; le.minWidth = width; }
            if (height >= 0) { le.preferredHeight = height; le.minHeight = height; }
            if (flexW >= 0) le.flexibleWidth = flexW;
            if (flexH >= 0) le.flexibleHeight = flexH;
            return le;
        }

        public static RectTransform Spacer(Transform parent, float flex = 1)
        {
            var rt = Rect("Spacer", parent);
            Size(rt, flexW: flex, flexH: flex);
            return rt;
        }

        public static void Fit(Component c, bool vertical = true, bool horizontal = false)
        {
            var f = c.gameObject.GetComponent<ContentSizeFitter>() ?? c.gameObject.AddComponent<ContentSizeFitter>();
            f.verticalFit = vertical ? ContentSizeFitter.FitMode.PreferredSize : ContentSizeFitter.FitMode.Unconstrained;
            f.horizontalFit = horizontal ? ContentSizeFitter.FitMode.PreferredSize : ContentSizeFitter.FitMode.Unconstrained;
        }

        // ---- the app's components --------------------------------------------

        /// <summary>A frosted rounded card.</summary>
        public static Image Card(Transform parent, string name = "Card", Color? color = null, float radius = Theme.CardRadius)
        {
            var img = Panel(parent, name, color ?? Theme.Card, radius);
            return img;
        }

        public static Button Clickable(GameObject go, UnityAction onClick)
        {
            var b = go.GetComponent<Button>() ?? go.AddComponent<Button>();
            var colors = b.colors;
            colors.normalColor = Color.white;
            colors.highlightedColor = Color.white;
            colors.pressedColor = new Color(0.86f, 0.86f, 0.86f, 1);
            colors.selectedColor = Color.white;
            colors.disabledColor = new Color(1, 1, 1, 0.45f);
            colors.fadeDuration = 0.06f;
            b.colors = colors;
            b.onClick.AddListener(() =>
            {
                if (Time.unscaledTime - LastScreenChange < 0.35f || Time.frameCount - LastScreenFrame <= 6) return;
                Sfx.Tap();
                onClick?.Invoke();
            });
            return b;
        }

        /// <summary>The corner tile: a glyph over one word on a frosted square.</summary>
        public static Button Tile(Transform parent, string glyph, string label, UnityAction onClick,
            float width = Theme.TileSize, float height = Theme.TileSize - 10)
        {
            var bg = Card(parent, "Tile-" + label, Theme.Frost, Theme.TileRadius);
            var rt = (RectTransform)bg.transform;
            rt.sizeDelta = new Vector2(width, height);
            Size(bg, width, height);
            var icon = Icon(bg.transform, glyph, 64, Theme.Ink);
            Place((RectTransform)icon.transform, new Vector2(0.5f, 1), new Vector2(64, 64), new Vector2(0, -30));
            var text = Text(bg.transform, label, Theme.LabelSize, Theme.Medium, Theme.Ink, TextAlignmentOptions.Center);
            text.name = "Label";
            text.textWrappingMode = TextWrappingModes.NoWrap;
            text.overflowMode = TextOverflowModes.Overflow;
            Place(text.rectTransform, new Vector2(0.5f, 0), new Vector2(width, 56), new Vector2(0, 26));
            return Clickable(bg.gameObject, onClick);
        }

        public static void SetTile(Button tile, string glyph, string label)
        {
            if (tile == null) return;
            var icon = tile.GetComponentInChildren<Image>(true);
            foreach (var img in tile.GetComponentsInChildren<Image>(true))
                if (img.gameObject != tile.gameObject) { img.sprite = Icons.Get(glyph); break; }
            var text = tile.GetComponentInChildren<TextMeshProUGUI>(true);
            if (text != null) text.text = label;
        }

        public static void SetEnabled(Button b, bool on)
        {
            if (b == null) return;
            b.interactable = on;
            foreach (var g in b.GetComponentsInChildren<Graphic>(true))
            {
                if (g.gameObject == b.gameObject) continue;
                var c = g.color;
                c.a = on ? 1f : 0.35f;
                g.color = c;
            }
        }

        /// <summary>A wide button: label (and optional trailing glyph) on a rounded fill.</summary>
        public static Button Wide(Transform parent, string label, UnityAction onClick, bool primary = true,
            string glyph = null, float height = 120)
        {
            var bg = Card(parent, "Button-" + label, primary ? Theme.Brand : Theme.CardSolid, 32);
            Size(bg, -1, height);
            var row = Rect("Row", bg.transform);
            Fill(row);
            Row(row, 24, new RectOffset(40, 40, 0, 0), TextAnchor.MiddleCenter);
            var text = Text(row, label, Theme.LabelSize + 2, Theme.SemiBold, primary ? Color.white : Theme.Ink, TextAlignmentOptions.Center);
            text.textWrappingMode = TextWrappingModes.NoWrap;
            text.overflowMode = TextOverflowModes.Overflow;
            Fit(text, true, true);
            if (glyph != null)
            {
                var icon = Icon(row, glyph, 54, primary ? Color.white : Theme.Ink);
                Size(icon, 54, 54);
            }
            if (!primary)
            {
                var outline = bg.gameObject.AddComponent<Outline>();
                outline.effectColor = new Color(0, 0, 0, 0.08f);
                outline.effectDistance = new Vector2(2, -2);
            }
            return Clickable(bg.gameObject, onClick);
        }

        public static void SetLabel(Button b, string label)
        {
            var t = b != null ? b.GetComponentInChildren<TextMeshProUGUI>(true) : null;
            if (t != null) t.text = label;
        }

        public static TMP_InputField Field(Transform parent, string placeholder, bool secret = false, bool numeric = false)
        {
            var bg = Card(parent, "Field", Theme.Field, 26);
            Size(bg, -1, 116);
            var outline = bg.gameObject.AddComponent<Outline>();
            outline.effectColor = Theme.FieldStroke;
            outline.effectDistance = new Vector2(2, -2);

            var area = Rect("Text Area", bg.transform);
            Fill(area);
            area.offsetMin = new Vector2(36, 8);
            area.offsetMax = new Vector2(-36, -8);
            area.gameObject.AddComponent<RectMask2D>();

            var hint = Text(area, placeholder, Theme.BodySize, Theme.Medium, Theme.InkFaint, TextAlignmentOptions.MidlineLeft);
            Fill(hint.rectTransform);
            hint.textWrappingMode = TextWrappingModes.NoWrap;
            var value = Text(area, "", Theme.BodySize, Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Fill(value.rectTransform);
            value.textWrappingMode = TextWrappingModes.NoWrap;

            var field = bg.gameObject.AddComponent<TMP_InputField>();
            field.textViewport = area;
            field.textComponent = value;
            field.placeholder = hint;
            field.fontAsset = Theme.Medium;
            field.pointSize = Theme.BodySize;
            field.lineType = TMP_InputField.LineType.SingleLine;
            field.contentType = secret
                ? (numeric ? TMP_InputField.ContentType.Pin : TMP_InputField.ContentType.Password)
                : (numeric ? TMP_InputField.ContentType.IntegerNumber : TMP_InputField.ContentType.Standard);
            field.caretColor = Theme.Ink;
            field.selectionColor = new Color(Theme.Brand.r, Theme.Brand.g, Theme.Brand.b, 0.3f);
            field.caretWidth = 3;
            return field;
        }

        /// <summary>A vertical scroll list; returns the content rect to add rows to.</summary>
        public static RectTransform ScrollList(Transform parent, float spacing, out ScrollRect scroll, bool horizontal = false)
        {
            var view = Rect("Scroll", parent);
            scroll = view.gameObject.AddComponent<ScrollRect>();
            var viewport = Rect("Viewport", view);
            Fill(viewport);
            viewport.gameObject.AddComponent<RectMask2D>();
            var hit = viewport.gameObject.AddComponent<Image>();
            hit.color = new Color(0, 0, 0, 0);
            var content = Rect("Content", viewport);
            if (horizontal)
            {
                content.anchorMin = new Vector2(0, 0);
                content.anchorMax = new Vector2(0, 1);
                content.pivot = new Vector2(0, 0.5f);
                var row = Row(content, spacing, new RectOffset(4, 4, 4, 4), TextAnchor.UpperLeft);
                row.childControlHeight = true;
                row.childForceExpandHeight = true;
                Fit(content, false, true);
            }
            else
            {
                content.anchorMin = new Vector2(0, 1);
                content.anchorMax = new Vector2(1, 1);
                content.pivot = new Vector2(0.5f, 1);
                Column(content, spacing, new RectOffset(4, 4, 4, 24));
                Fit(content);
            }
            // A new rect keeps a 100-unit default size; stretched, that makes the
            // content 100 wider than its viewport and shifts it 50 to the left.
            content.sizeDelta = Vector2.zero;
            content.anchoredPosition = Vector2.zero;
            scroll.viewport = viewport;
            scroll.content = content;
            scroll.horizontal = horizontal;
            scroll.vertical = !horizontal;
            scroll.movementType = ScrollRect.MovementType.Elastic;
            scroll.scrollSensitivity = 40;
            return content;
        }

        public static void Clear(Transform t)
        {
            for (var i = t.childCount - 1; i >= 0; i--) UnityEngine.Object.Destroy(t.GetChild(i).gameObject);
        }

        /// <summary>The rule under a card title: heavy segment(s) over a hairline.</summary>
        public static RectTransform Rule(Transform parent, int segments = 1, int filled = 1)
        {
            var rt = Rect("Rule", parent);
            Size(rt, -1, 6);
            var line = Panel(rt, "Hair", Theme.Line);
            Fill((RectTransform)line.transform);
            ((RectTransform)line.transform).anchorMin = new Vector2(0, 0.5f);
            ((RectTransform)line.transform).anchorMax = new Vector2(1, 0.5f);
            ((RectTransform)line.transform).sizeDelta = new Vector2(0, 2);
            segments = Mathf.Max(1, segments);
            for (var i = 0; i < Mathf.Min(filled, segments); i++)
            {
                var seg = Panel(rt, "Seg", Theme.Ink, 3);
                var srt = (RectTransform)seg.transform;
                srt.anchorMin = new Vector2((float)i / segments, 0);
                srt.anchorMax = new Vector2((float)(i + 1) / segments, 1);
                srt.offsetMin = new Vector2(i == 0 ? 0 : 6, 0);
                srt.offsetMax = new Vector2(-6, 0);
            }
            return rt;
        }

        // ---- textures -----------------------------------------------------------

        /// <summary>The backdrop: light paper, a square grid and a faint slash in each cell.</summary>
        public static RawImage GraphPaper(Transform parent)
        {
            var rt = Rect("GraphPaper", parent);
            Fill(rt);
            var raw = rt.gameObject.AddComponent<RawImage>();
            if (_paper == null)
            {
                const int n = 128;
                var tex = new Texture2D(n, n, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear, name = "paper" };
                var px = new Color[n * n];
                for (var y = 0; y < n; y++)
                for (var x = 0; x < n; x++)
                {
                    var c = Theme.Paper;
                    var grid = x < 2 || y < 2;
                    var slash = Mathf.Abs(x - y) < 1.2f && x > n * 0.36f && x < n * 0.64f;
                    if (grid) c = Theme.Grid;
                    else if (slash) c = Color.Lerp(Theme.Paper, Theme.Grid, 0.75f);
                    px[y * n + x] = c;
                }
                tex.SetPixels(px);
                tex.Apply(true);
                _paper = Sprite.Create(tex, new UnityEngine.Rect(0, 0, n, n), Vector2.zero);
            }
            raw.texture = _paper.texture;
            raw.uvRect = new UnityEngine.Rect(0, 0, 2340f / 150f, 1080f / 150f);
            raw.raycastTarget = true;
            return raw;
        }

        public static Sprite RingSprite()
        {
            if (_ring != null) return _ring;
            const int n = 256;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, true) { name = "ring" };
            var px = new Color32[n * n];
            var c = (n - 1) / 2f;
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var d = Mathf.Sqrt((x - c) * (x - c) + (y - c) * (y - c));
                var a = Mathf.Clamp01(Mathf.Min(d - (c * 0.70f), c - 1 - d) + 0.5f);
                px[y * n + x] = new Color32(255, 255, 255, (byte)(a * 255));
            }
            tex.SetPixels32(px);
            tex.Apply(true);
            _ring = Sprite.Create(tex, new UnityEngine.Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100);
            return _ring;
        }

        public static Sprite CircleSprite()
        {
            if (_circle != null) return _circle;
            const int n = 128;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, true) { name = "circle" };
            var px = new Color32[n * n];
            var c = (n - 1) / 2f;
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var d = Mathf.Sqrt((x - c) * (x - c) + (y - c) * (y - c));
                px[y * n + x] = new Color32(255, 255, 255, (byte)(Mathf.Clamp01(c - d + 0.5f) * 255));
            }
            tex.SetPixels32(px);
            tex.Apply(true);
            _circle = Sprite.Create(tex, new UnityEngine.Rect(0, 0, n, n), new Vector2(0.5f, 0.5f), 100);
            return _circle;
        }

        /// <summary>The high-score ring: grey track, purple-to-red arc filled to the percent.</summary>
        public static RectTransform ScoreRing(Transform parent, float size, int percent)
        {
            var rt = Rect("ScoreRing", parent);
            rt.sizeDelta = new Vector2(size, size);
            Size(rt, size, size);
            var track = Panel(rt, "Track", Hex(0xE3E3E3));
            track.sprite = RingSprite();
            Fill((RectTransform)track.transform);
            const int steps = 24;
            var arcs = new Image[steps];
            for (var i = steps - 1; i >= 0; i--)
            {
                var arc = Panel(rt, "Arc", Color.Lerp(Theme.Score, Theme.ScoreEnd, (float)i / steps));
                arc.sprite = RingSprite();
                arc.type = Image.Type.Filled;
                arc.fillMethod = Image.FillMethod.Radial360;
                arc.fillOrigin = (int)Image.Origin360.Top;
                arc.fillClockwise = true;
                Fill((RectTransform)arc.transform);
                arcs[i] = arc;
            }
            rt.gameObject.AddComponent<ScoreRingFill>().Init(arcs).Set(Mathf.Clamp(percent, 0, 100) / 100f);
            return rt;
        }

        private static Color Hex(int rgb) => Theme.Hex(rgb);

        /// <summary>Blocks touches to whatever is behind (used under sheets and dialogs).</summary>
        public static Image Scrim(Transform parent, Color? color = null, UnityAction onTap = null)
        {
            var img = Panel(parent, "Scrim", color ?? Theme.Scrim);
            Fill((RectTransform)img.transform);
            if (onTap != null) Clickable(img.gameObject, onTap).transition = Selectable.Transition.None;
            return img;
        }

        public static void Destroy(Component c)
        {
            if (c != null) UnityEngine.Object.Destroy(c.gameObject);
        }
    }

    /// <summary>The interface's own small sounds (a soft tap), synthesised so no file ships.</summary>
    public static class Sfx
    {
        private static AudioSource _source;
        private static AudioClip _tap;

        public static void Tap()
        {
            if (_source == null)
            {
                var go = new GameObject("ElimuAR-Sfx");
                UnityEngine.Object.DontDestroyOnLoad(go);
                _source = go.AddComponent<AudioSource>();
                _source.playOnAwake = false;
                _source.volume = 0.35f;
                const int rate = 44100;
                var data = new float[rate / 25];
                for (var i = 0; i < data.Length; i++)
                {
                    var t = (float)i / rate;
                    data[i] = Mathf.Sin(2 * Mathf.PI * 1250 * t) * Mathf.Exp(-t * 90f) * 0.6f;
                }
                _tap = AudioClip.Create("tap", data.Length, 1, rate, false);
                _tap.SetData(data, 0);
            }
            if (Settings.UiSounds) _source.PlayOneShot(_tap);
        }
    }

    public class ScoreRingFill : MonoBehaviour
    {
        private Image[] _arcs;

        public ScoreRingFill Init(Image[] arcs)
        {
            _arcs = arcs;
            return this;
        }

        public void Set(float portion)
        {
            for (var i = 0; i < _arcs.Length; i++)
            {
                var amount = (i + 1f) / _arcs.Length * portion;
                _arcs[i].fillAmount = amount;
                _arcs[i].enabled = amount > 0;
            }
        }
    }
}
