using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ElimuAR
{
    // The controls over the AR view and the two paper screens.
    public class ActivityHud
    {
        private const float Edge = 122f;   // left/right inset of the chrome
        private const float Top = 49f;
        private const float Bottom = 50f;
        private const float TileW = 197f, TileH = 183f, Gap = 14f;

        public RectTransform Root { get; private set; }
        private RectTransform _chrome;
        private RectTransform _card;
        private TextMeshProUGUI _cardEyebrow, _cardTitle, _cardCounter, _cardBody;
        private RectTransform _rule;
        private RectTransform _searching;
        private TextMeshProUGUI _caption;
        private Button _more, _second, _hide, _back, _secondary, _primary;
        private RectTransform _tray;
        private RectTransform _panel;
        private readonly Dictionary<Tool, Button> _toolButtons = new Dictionary<Tool, Button>();
        private bool _hidden;
        private Button _showTile;
        private Image _timer;
        private TextMeshProUGUI _timerText;

        public event Action MorePressed, HelpPressed, ToolsPressed, HidePressed, BackPressed, PrimaryPressed, SecondaryPressed;

        public ActivityHud(RectTransform parent)
        {
            Root = Kit.Fill(Kit.Rect("ActivityHud", parent));
            _chrome = Kit.Fill(Kit.Rect("Chrome", Root));
            BuildCard();
            BuildSearching();
            BuildCaption();
            BuildTiles();
        }

        public void Destroy() => UnityEngine.Object.Destroy(Root.gameObject);

        // ---- the step card --------------------------------------------------------

        private void BuildCard()
        {
            var card = Kit.Card(_chrome, "StepCard", Theme.Card, 48);
            _card = (RectTransform)card.transform;
            _card.anchorMin = _card.anchorMax = _card.pivot = new Vector2(0, 1);
            _card.anchoredPosition = new Vector2(Edge, -Top);
            _card.sizeDelta = new Vector2(730, 0);
            Kit.Column(card.transform, 8, new RectOffset(50, 50, 52, 50));
            Kit.Fit(card);

            _cardEyebrow = Kit.Text(card.transform, "", 38, Theme.SemiBold);
            Kit.Fit(_cardEyebrow);
            var head = Kit.Rect("Head", card.transform);
            Kit.Row(head, 10, null, TextAnchor.LowerLeft);
            _cardTitle = Kit.Text(head, "", 70, Theme.Bold);
            _cardTitle.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Size(_cardTitle, flexW: 1);
            Kit.Fit(_cardTitle);
            _cardCounter = Kit.Text(head, "", 40, Theme.Medium, Theme.Ink, TextAlignmentOptions.BottomRight);
            _cardCounter.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Size(_cardCounter, 170, 60);
            Kit.Size(head, -1, 92);
            _rule = Kit.Rule(card.transform);
            var gap = Kit.Rect("Gap", card.transform);
            Kit.Size(gap, -1, 26);
            _cardBody = Kit.Text(card.transform, "", 42, Theme.Medium);
            Kit.Fit(_cardBody);
        }

        /// <summary>The step card.</summary>
        public void Card(string eyebrow, string title, string body, int index = 0, int total = 0)
        {
            _cardHasContent = true;
            _card.gameObject.SetActive(!_cardHidden);
            _cardEyebrow.text = eyebrow ?? "";
            _cardEyebrow.gameObject.SetActive(!string.IsNullOrEmpty(eyebrow));
            _cardTitle.text = title ?? "";
            _cardCounter.text = total > 0 ? $"{index} of {total}" : "";
            _cardBody.text = body ?? "";
            var ruleParent = _rule.parent;
            var at = _rule.GetSiblingIndex();
            UnityEngine.Object.Destroy(_rule.gameObject);
            _rule = Kit.Rule(ruleParent, total > 0 ? total : 1, total > 0 ? index : 1);
            _rule.SetSiblingIndex(at);
        }

        public void HideCard()
        {
            _cardHasContent = false;
            _card.gameObject.SetActive(false);
        }

        private bool _cardHidden, _cardHasContent;

        /// <summary>Hide / Show: only the explanation card goes away.</summary>
        public void ToggleCard()
        {
            _cardHidden = !_cardHidden;
            _card.gameObject.SetActive(_cardHasContent && !_cardHidden);
            Kit.SetTile(_hide, _cardHidden ? "show" : "hide", _cardHidden ? "Show" : "Hide");
        }

        // ---- searching for surfaces -----------------------------------------------

        private void BuildSearching()
        {
            _searching = Kit.Fill(Kit.Rect("Searching", _chrome));
            var title = Kit.Text(_searching, "Searching for Surfaces...", 72, Theme.Bold, Color.white, TextAlignmentOptions.Center);
            Kit.Place(title.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1600, 100), new Vector2(0, 230));
            Shadow(title);
            var phone = Kit.Icon(_searching, "phone", 300, Color.white);
            Kit.Place((RectTransform)phone.transform, new Vector2(0.5f, 0.5f), new Vector2(300, 300), new Vector2(40, 30));
            phone.gameObject.AddComponent<Sweep>();
            var sub = Kit.Text(_searching, "Slowly move your camera throughout the space.", 44, Theme.Bold, Color.white, TextAlignmentOptions.Center);
            Kit.Place(sub.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(1600, 70), new Vector2(0, -190));
            Shadow(sub);
            _searching.gameObject.SetActive(false);
        }

        public void Searching(bool on) => _searching.gameObject.SetActive(on && !_hidden);

        private static void Shadow(TextMeshProUGUI t)
        {
            var s = t.gameObject.AddComponent<UnityEngine.UI.Shadow>();
            s.effectColor = new Color(0, 0, 0, 0.55f);
            s.effectDistance = new Vector2(3, -3);
            t.outlineColor = new Color32(30, 30, 30, 255);
            t.outlineWidth = 0.12f;
        }

        // ---- captions ---------------------------------------------------------------

        private void BuildCaption()
        {
            _caption = Kit.Text(_chrome, "", 44, Theme.Bold, Color.white, TextAlignmentOptions.Bottom);
            Kit.Place(_caption.rectTransform, new Vector2(0.5f, 0), new Vector2(1240, 260), new Vector2(0, Bottom + 24));
            _caption.outlineColor = new Color32(20, 20, 20, 255);
            _caption.outlineWidth = 0.22f;
            _caption.overflowMode = TextOverflowModes.Overflow;
        }

        public void Caption(string text)
        {
            _caption.text = Settings.Captions ? text ?? "" : "";
        }

        // ---- tiles ------------------------------------------------------------------

        private Button CornerTile(string glyph, string label, Vector2 anchor, Vector2 offset, UnityAction click, float width = TileW)
        {
            var t = Kit.Tile(_chrome, glyph, label, click, width, TileH);
            Kit.Place((RectTransform)t.transform, anchor, new Vector2(width, TileH), offset);
            return t;
        }

        private void BuildTiles()
        {
            _more = CornerTile("more", "More", Vector2.one, new Vector2(-Edge + 70, -Top), () => MorePressed?.Invoke(), 190);
            _second = CornerTile("help", "Help", Vector2.one, new Vector2(-Edge + 70, -Top - TileH - 50), () =>
            {
                if (Kit_IsTools()) ToolsPressed?.Invoke();
                else HelpPressed?.Invoke();
            }, 190);
            _hide = CornerTile("hide", "Hide", Vector2.zero, new Vector2(Edge, Bottom), () => HidePressed?.Invoke());
            _back = CornerTile("back", "Back", Vector2.zero, new Vector2(Edge + TileW + Gap, Bottom), () => BackPressed?.Invoke(), 188);
            _primary = CornerTile("next", "Next", new Vector2(1, 0), new Vector2(-Edge + 70, Bottom), () => PrimaryPressed?.Invoke(), 180);
            _secondary = CornerTile("replay", "Replay", new Vector2(1, 0), new Vector2(-Edge + 70 - 180 - Gap, Bottom), () => SecondaryPressed?.Invoke(), 225);
            _showTile = Kit.Tile(Root, "show", "Show", () => HidePressed?.Invoke(), TileW, TileH);
            Kit.Place((RectTransform)_showTile.transform, Vector2.zero, new Vector2(TileW, TileH), new Vector2(Edge, Bottom));
            _showTile.gameObject.SetActive(false);
        }

        private bool _secondIsTools;
        private bool Kit_IsTools() => _secondIsTools;

        /// <summary>Setup shows Help under More; the activity steps show Tools there.</summary>
        public void SecondTile(bool tools)
        {
            _secondIsTools = tools;
            Kit.SetTile(_second, tools ? "draw" : "help", tools ? "Tools" : "Help");
        }

        public void Primary(string glyph, string label, bool enabled = true)
        {
            _primary.gameObject.SetActive(!string.IsNullOrEmpty(label));
            if (string.IsNullOrEmpty(label)) return;
            Kit.SetTile(_primary, glyph, label);
            var w = label.Length > 5 ? 230f : 180f;
            ((RectTransform)_primary.transform).sizeDelta = new Vector2(w, TileH);
            Kit.SetEnabled(_primary, enabled);
            LayoutSecondary();
        }

        public void PrimaryEnabled(bool on) => Kit.SetEnabled(_primary, on);

        public void Secondary(string glyph, string label, bool enabled = true)
        {
            _secondary.gameObject.SetActive(!string.IsNullOrEmpty(label));
            if (string.IsNullOrEmpty(label)) return;
            Kit.SetTile(_secondary, glyph, label);
            Kit.SetEnabled(_secondary, enabled);
            LayoutSecondary();
        }

        private void LayoutSecondary()
        {
            var pw = ((RectTransform)_primary.transform).sizeDelta.x;
            var srt = (RectTransform)_secondary.transform;
            srt.anchoredPosition = new Vector2(-Edge + 70 - pw - Gap, Bottom);
        }

        public void ShowCorners(bool more, bool second, bool hide, bool back)
        {
            _more.gameObject.SetActive(more);
            _second.gameObject.SetActive(second);
            _hide.gameObject.SetActive(hide);
            _back.gameObject.SetActive(back);
            var brt = (RectTransform)_back.transform;
            brt.anchoredPosition = new Vector2(hide ? Edge + TileW + Gap : Edge, Bottom);
        }

        /// <summary>Hide clears the view down to the camera feed and one Show tile.</summary>
        public void SetHidden(bool hidden)
        {
            _hidden = hidden;
            _chrome.gameObject.SetActive(!hidden);
            _showTile.gameObject.SetActive(hidden);
            if (hidden) CloseTray();
        }

        public bool Hidden => _hidden;

        // ---- the tools tray ---------------------------------------------------------

        public bool TrayOpen => _tray != null;

        public void OpenTray(Tool current, Action<Tool> pick, Action clear, Action camera)
        {
            CloseTray();
            var tray = Kit.Card(_chrome, "ToolsTray", Theme.Frost, 36);
            _tray = (RectTransform)tray.transform;
            _tray.anchorMin = _tray.anchorMax = _tray.pivot = new Vector2(1, 1);
            _tray.anchoredPosition = new Vector2(-Edge + 70 - 190 - 24, -Top - TileH - 50);
            Kit.Row(tray.transform, 12, new RectOffset(16, 16, 16, 16));
            Kit.Fit(tray, true, true);
            _toolButtons.Clear();
            void ToolTile(Tool t, string glyph, string label)
            {
                var b = Kit.Tile(tray.transform, glyph, label, () => pick(t), 176, 168);
                _toolButtons[t] = b;
            }
            ToolTile(Tool.Parts, "parts", "Parts");
            ToolTile(Tool.All, "all", "Move All");
            ToolTile(Tool.Rotate, "rotate", "Rotate");
            ToolTile(Tool.Scale, "scale", "Size");
            ToolTile(Tool.Draw, "draw", "Draw");
            ToolTile(Tool.Erase, "erase", "Erase");
            Kit.Tile(tray.transform, "clear", "Clear", () => clear(), 176, 168);
            Kit.Tile(tray.transform, "camera", "Camera", () => camera(), 176, 168);
            MarkTool(current);
        }

        public void MarkTool(Tool current)
        {
            foreach (var pair in _toolButtons)
            {
                var img = pair.Value.GetComponent<Image>();
                img.color = pair.Key == current ? Theme.Brand : Theme.Frost;
                foreach (var g in pair.Value.GetComponentsInChildren<Graphic>(true))
                    if (g.gameObject != pair.Value.gameObject) g.color = pair.Key == current ? Color.white : Theme.Ink;
            }
        }

        public void CloseTray()
        {
            if (_tray != null) UnityEngine.Object.Destroy(_tray.gameObject);
            _tray = null;
        }

        // ---- panels (More Options, Help, AR Settings) ----------------------------------

        public void ClosePanel()
        {
            if (_panel != null) UnityEngine.Object.Destroy(_panel.gameObject);
            _panel = null;
        }

        private RectTransform DarkPanel(string title, float width, float height)
        {
            ClosePanel();
            _panel = Kit.Fill(Kit.Rect("Panel", UiRoot.Instance.Overlay));
            Kit.Scrim(_panel, new Color(0, 0, 0, 0.001f), ClosePanel);
            var card = Kit.Card(_panel, "Card", new Color(0.29f, 0.29f, 0.29f, 0.93f), 60);
            var rt = (RectTransform)card.transform;
            Kit.Place(rt, new Vector2(0.5f, 0.5f), new Vector2(width, height), Vector2.zero);
            var t = Kit.Text(card.transform, title, 50, Theme.Bold, Color.white, TextAlignmentOptions.Center);
            Kit.Place(t.rectTransform, new Vector2(0.5f, 1), new Vector2(width - 200, 90), new Vector2(0, -50));
            var close = Kit.Panel(card.transform, "Close", new Color(0, 0, 0, 0));
            Kit.Place((RectTransform)close.transform, Vector2.one, new Vector2(110, 110), new Vector2(-40, -36));
            var x = Kit.Icon(close.transform, "close", 56, Color.white);
            Kit.Place((RectTransform)x.transform, new Vector2(0.5f, 0.5f), new Vector2(56, 56), Vector2.zero);
            Kit.Clickable(close.gameObject, ClosePanel);
            return rt;
        }

        private static Button PanelTile(Transform parent, string glyph, string label, UnityAction click, bool enabled = true)
        {
            var b = Kit.Tile(parent, glyph, label, click, 316, 184);
            b.GetComponent<Image>().color = Hex(0xF0F0F0);
            Kit.SetEnabled(b, enabled);
            return b;
        }

        private static Color Hex(int rgb) => Theme.Hex(rgb);

        /// <summary>An assignment's clock, top centre, over everything (questions too).</summary>
        public void Timer(string text, bool urgent)
        {
            if (text == null)
            {
                if (_timer != null) UnityEngine.Object.Destroy(_timer.gameObject);
                _timer = null;
                return;
            }
            if (_timer == null)
            {
                _timer = Kit.Card(Root, "AssignmentClock", Theme.Ink, 44);
                Kit.Row(_timer.transform, 18, new RectOffset(40, 44, 14, 14), TextAnchor.MiddleCenter);
                Kit.Size(Kit.Icon(_timer.transform, "clock", 48, Color.white), 48, 48);
                _timerText = Kit.Text(_timer.transform, "", 40, Theme.Bold, Color.white);
                _timerText.textWrappingMode = TextWrappingModes.NoWrap;
                Kit.Fit(_timerText, true, true);
                Kit.Fit(_timer, true, true);
                var rt = (RectTransform)_timer.transform;
                rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(0.5f, 1);
                rt.anchoredPosition = new Vector2(0, -Top - 20);
            }
            _timer.color = urgent ? Theme.Wrong : Theme.Ink;
            _timerText.text = text;
            _timer.transform.SetAsLastSibling();
        }

        /// <summary>More Options: Exit, Restart, AR Settings, then Continue (Restart shown but disabled).</summary>
        public void MoreOptions(Action exit, Action restart, Action arSettings, bool arSettingsEnabled)
        {
            var card = DarkPanel("More Options", 1290, 534);
            var row = Kit.Rect("Row", card);
            Kit.Place(row, new Vector2(0.5f, 1), new Vector2(1060, 184), new Vector2(0, -155));
            Kit.Row(row, 48, null, TextAnchor.MiddleCenter);
            PanelTile(row, "exit", "Exit", () => { ClosePanel(); exit(); });
            PanelTile(row, "restart", "Restart", () => { ClosePanel(); restart?.Invoke(); }, restart != null);
            PanelTile(row, "settings", "AR Settings", () => { ClosePanel(); arSettings(); }, arSettingsEnabled);
            var cont = Kit.Wide(card, "Continue", ClosePanel, false, null, 98);
            Kit.Place((RectTransform)cont.transform, new Vector2(0.5f, 0), new Vector2(610, 98), new Vector2(0, 50));
            cont.GetComponent<Image>().color = Hex(0xF0F0F0);
        }

        public void Help(bool setup)
        {
            var card = DarkPanel(setup ? "AR Setup Help" : "AR Controls", 1500, 760);
            var body = Kit.Text(card, setup
                ? "• Aim your camera at a flat, open surface such as a desk or the floor.\n" +
                  "• Slowly move your camera throughout the space until the surface is found.\n" +
                  "• Good light helps. Plain, shiny or very dark surfaces are hard to find.\n" +
                  "• Select <b>Anchor</b> to set your activity space, then <b>Done</b> to keep it or <b>Reset</b> to try again."
                : "• <b>Parts:</b> touch and drag a part to take it out, then drop it on its tray.\n" +
                  "• Touch and hold a part to hear what it is.\n" +
                  "• <b>Move All:</b> drag outside the parts to slide the whole activity.\n" +
                  "• <b>Rotate:</b> drag outside the parts to turn the activity.\n" +
                  "• <b>Size:</b> pinch with two fingers, or drag up and down.\n" +
                  "• <b>Draw</b> and <b>Erase</b> mark the scene; <b>Clear</b> removes all marks; <b>Camera</b> saves a photo.",
                40, Theme.Medium, Color.white);
            Kit.Place(body.rectTransform, new Vector2(0.5f, 1), new Vector2(1320, 520), new Vector2(0, -170));
        }

        public void ArSettings(Action changed)
        {
            var card = DarkPanel("AR Settings", 1290, 700);
            var list = Kit.Rect("List", card);
            Kit.Place(list, new Vector2(0.5f, 1), new Vector2(1060, 480), new Vector2(0, -160));
            Kit.Column(list, 20);
            Toggle(list, "Surface guides", () => Settings.SurfaceGuides, v => { Settings.SurfaceGuides = v; changed(); });
            Toggle(list, "Captions", () => Settings.Captions, v => { Settings.Captions = v; changed(); });
            Toggle(list, "Voiceover", () => !Settings.Muted, v => { Settings.Muted = !v; changed(); });
            Toggle(list, "Interface sounds", () => Settings.UiSounds, v => Settings.UiSounds = v);
        }

        private static void Toggle(Transform parent, string label, Func<bool> get, Action<bool> set)
        {
            var row = Kit.Card(parent, label, Hex(0xF0F0F0), 28);
            Kit.Size(row, -1, 100);
            var t = Kit.Text(row.transform, "", 40, Theme.SemiBold, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Fill(t.rectTransform, 0);
            t.rectTransform.offsetMin = new Vector2(40, 0);
            t.rectTransform.offsetMax = new Vector2(-40, 0);
            void Draw() => t.text = $"{label}<pos=78%><color=#{(get() ? "138A2B" : "9E9E9E")}>{(get() ? "On" : "Off")}</color>";
            Draw();
            Kit.Clickable(row.gameObject, () => { set(!get()); Draw(); });
        }

        // ---- the question paper -------------------------------------------------------

        public class QuestionView
        {
            public RectTransform Root;
            public TextMeshProUGUI Banner;
            public Image BannerBg;
            public List<Image> Rows = new List<Image>();
            public List<TextMeshProUGUI> Letters = new List<TextMeshProUGUI>();
            public List<Image> Marks = new List<Image>();
            public Button Back, Action, More;
        }

        public QuestionView Question(string activity, int index, int total, string stem, List<string> answers,
            Action<int> pick, Action back, Action action, Action more)
        {
            var v = new QuestionView { Root = Kit.Fill(Kit.Rect("QuestionPaper", Root)) };
            Kit.GraphPaper(v.Root);

            var left = Kit.Card(v.Root, "Question", Color.white, 56);
            Kit.Place((RectTransform)left.transform, new Vector2(0, 1), new Vector2(700, 816), new Vector2(363, -132));
            Kit.Column(left.transform, 8, new RectOffset(50, 50, 52, 50));
            Kit.Fit(Kit.Text(left.transform, activity, 38, Theme.SemiBold));
            var head = Kit.Rect("Head", left.transform);
            Kit.Row(head, 10, null, TextAnchor.LowerLeft);
            Kit.Size(head, -1, 92);
            var title = Kit.Text(head, "Question", 70, Theme.Bold);
            title.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Size(title, flexW: 1);
            var counter = Kit.Text(head, $"{index} of {total}", 40, Theme.Medium, Theme.Ink, TextAlignmentOptions.BottomRight);
            Kit.Size(counter, 170, 60);
            Kit.Rule(left.transform, total, index);
            var gap = Kit.Rect("Gap", left.transform);
            Kit.Size(gap, -1, 34);
            v.BannerBg = Kit.Card(left.transform, "Banner", Theme.Score, 22);
            Kit.Size(v.BannerBg, -1, 140);
            v.Banner = Kit.Text(v.BannerBg.transform, "", 42, Theme.Bold, Color.white, TextAlignmentOptions.MidlineLeft);
            Kit.Fill(v.Banner.rectTransform);
            v.Banner.rectTransform.offsetMin = new Vector2(48, 0);
            v.BannerBg.gameObject.SetActive(false);
            var gap2 = Kit.Rect("Gap", left.transform);
            Kit.Size(gap2, -1, 20);
            Kit.Fit(Kit.Text(left.transform, stem, 42, Theme.Medium));

            const float rowH = 193f, rowGap = 14f;
            for (var i = 0; i < answers.Count && i < 6; i++)
            {
                var index2 = i;
                var row = Kit.Card(v.Root, "Answer" + i, Color.white, 28);
                var h = answers.Count > 4 ? (816 - rowGap * (answers.Count - 1)) / answers.Count : rowH;
                Kit.Place((RectTransform)row.transform, new Vector2(0, 1), new Vector2(940, h), new Vector2(1109, -132 - i * (h + rowGap)));
                var outline = row.gameObject.AddComponent<Outline>();
                outline.effectColor = new Color(0, 0, 0, 0);
                outline.effectDistance = new Vector2(5, -5);
                var letter = Kit.Text(row.transform, ((char)('A' + i)).ToString(), 46, Theme.Bold, Theme.Ink, TextAlignmentOptions.Center);
                Kit.Place(letter.rectTransform, new Vector2(0, 0.5f), new Vector2(100, 100), new Vector2(18, 0));
                var mark = Kit.Panel(row.transform, "Mark", Theme.Score);
                mark.sprite = Kit.CircleSprite();
                Kit.Place((RectTransform)mark.transform, new Vector2(0, 0.5f), new Vector2(66, 66), new Vector2(36, 0));
                var check = Kit.Icon(mark.transform, "check", 46, Color.white);
                Kit.Place((RectTransform)check.transform, new Vector2(0.5f, 0.5f), new Vector2(46, 46), Vector2.zero);
                mark.gameObject.SetActive(false);
                var text = Kit.Text(row.transform, answers[i], 44, Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
                Kit.Fill(text.rectTransform);
                text.rectTransform.offsetMin = new Vector2(135, 10);
                text.rectTransform.offsetMax = new Vector2(-40, -10);
                Kit.Clickable(row.gameObject, () => pick(index2));
                v.Rows.Add(row);
                v.Letters.Add(letter);
                v.Marks.Add(mark);
            }

            v.More = Kit.Tile(v.Root, "more", "More", () => more(), 190, TileH);
            Kit.Place((RectTransform)v.More.transform, Vector2.one, new Vector2(190, TileH), new Vector2(-Edge + 70, -Top));
            v.Back = Kit.Tile(v.Root, "back", "Back", () => back(), 188, TileH);
            Kit.Place((RectTransform)v.Back.transform, Vector2.zero, new Vector2(188, TileH), new Vector2(Edge, Bottom));
            v.Action = Kit.Tile(v.Root, "check", "Submit", () => action(), 220, TileH);
            Kit.Place((RectTransform)v.Action.transform, new Vector2(1, 0), new Vector2(220, TileH), new Vector2(-Edge + 70, Bottom));
            Kit.SetEnabled(v.Action, false);
            return v;
        }

        public static void MarkPicked(QuestionView v, int picked)
        {
            for (var i = 0; i < v.Rows.Count; i++)
            {
                var on = i == picked;
                v.Rows[i].GetComponent<Outline>().effectColor = on ? Theme.Score : new Color(0, 0, 0, 0);
                v.Letters[i].gameObject.SetActive(!on);
                v.Marks[i].gameObject.SetActive(on);
            }
            Kit.SetEnabled(v.Action, picked >= 0);
        }

        public static void Reveal(QuestionView v, int picked, int correct, string banner, bool right)
        {
            for (var i = 0; i < v.Rows.Count; i++)
            {
                var isPicked = i == picked;
                var isCorrect = i == correct;
                // Right: purple outline and check. Wrong: red outline and a cross
                // on the pick, and a quiet grey check (no outline) on the answer.
                v.Rows[i].GetComponent<Outline>().effectColor = isPicked ? (right ? Theme.Score : Theme.WrongBanner) : new Color(0, 0, 0, 0);
                v.Letters[i].gameObject.SetActive(!(isPicked || isCorrect));
                v.Marks[i].gameObject.SetActive(isPicked || isCorrect);
                v.Marks[i].color = isPicked ? (right ? Theme.Score : Theme.WrongBanner) : Theme.InkFaint;
                v.Marks[i].GetComponentsInChildren<Image>(true)[1].sprite = Icons.Get(isCorrect ? "check" : "close");
                v.Rows[i].GetComponent<Button>().interactable = false;
            }
            v.BannerBg.gameObject.SetActive(true);
            v.BannerBg.color = right ? Theme.Score : Theme.WrongBanner;
            v.Banner.text = banner;
        }

        // ---- the score screen ---------------------------------------------------------

        public RectTransform ScorePaper(ActivityInfo info, string title, int percent, Texture2D thumbnail, Action exit, Action play,
            string scoreLabel = "Your Current High Score")
        {
            var root = Kit.Fill(Kit.Rect("ScorePaper", Root));
            Kit.GraphPaper(root);
            var lockup = Brand.Lockup(root, 133);
            lockup.anchorMin = lockup.anchorMax = lockup.pivot = new Vector2(0, 1);
            lockup.anchoredPosition = new Vector2(122, -49);

            var thumb = Kit.Card(root, "Thumb", Theme.CardSolid, 52);
            Kit.Place((RectTransform)thumb.transform, new Vector2(0, 1), new Vector2(602, 602), new Vector2(260, -228));
            if (thumbnail != null)
            {
                var raw = Kit.Rect("Image", thumb.transform).gameObject.AddComponent<RawImage>();
                raw.texture = thumbnail;
                Kit.Fill(raw.rectTransform, 30);
                var fitter = raw.gameObject.AddComponent<AspectRatioFitter>();
                fitter.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
                fitter.aspectRatio = (float)thumbnail.width / Mathf.Max(1, thumbnail.height);
            }

            var head = Kit.Card(root, "Title", Theme.CardSolid, 52);
            Kit.Place((RectTransform)head.transform, new Vector2(0, 1), new Vector2(1316, 373), new Vector2(910, -228));
            Kit.Column(head.transform, 18, new RectOffset(100, 100, 90, 60));
            var t = Kit.Text(head.transform, title, 96, Theme.Bold);
            t.enableAutoSizing = true;
            t.fontSizeMin = 56;
            t.fontSizeMax = 96;
            Kit.Size(t, -1, 120);
            Kit.Rule(head.transform, 1, 0);
            Kit.Fit(Kit.Text(head.transform, "v" + (info?.version ?? ""), 40, Theme.Medium, Theme.InkSoft));

            var score = Kit.Card(root, "Score", Theme.CardSolid, 52);
            Kit.Place((RectTransform)score.transform, new Vector2(0, 1), new Vector2(1316, 199), new Vector2(910, -628));
            var label = Kit.Text(score.transform, scoreLabel, 40, Theme.Bold, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Place(label.rectTransform, new Vector2(0, 0.5f), new Vector2(700, 100), new Vector2(100, 0));
            var pct = Kit.Text(score.transform, percent >= 0 ? "0%" : "—", 64, Theme.Bold, Theme.Score, TextAlignmentOptions.MidlineRight);
            Kit.Place(pct.rectTransform, new Vector2(1, 0.5f), new Vector2(300, 100), new Vector2(-280, 0));
            var ring = Kit.ScoreRing(score.transform, 140, 0);
            Kit.Place(ring, new Vector2(1, 0.5f), new Vector2(140, 140), new Vector2(-100, 0));

            var exitTile = Kit.Card(root, "Exit", Theme.CardSolid, 30);
            Kit.Place((RectTransform)exitTile.transform, Vector2.zero, new Vector2(346, 183), new Vector2(49, 50));
            var er = Kit.Rect("Row", exitTile.transform);
            Kit.Fill(er);
            Kit.Row(er, 50, new RectOffset(60, 40, 0, 0), TextAnchor.MiddleLeft);
            Kit.Size(Kit.Icon(er, "exit", 64, Theme.Ink), 64, 64);
            Kit.Fit(Kit.Text(er, "Exit", 50, Theme.Medium), true, true);
            Kit.Clickable(exitTile.gameObject, () => exit());
            var reveal = root.gameObject.AddComponent<ScoreReveal>();
            reveal.Configure(percent, pct, ring.GetComponent<ScoreRingFill>(), ring,
                (RectTransform)lockup, (RectTransform)thumb.transform, (RectTransform)head.transform,
                (RectTransform)score.transform, (RectTransform)exitTile.transform);

            if (play == null) return root;
            var playTile = Kit.Card(root, "Play", Theme.CardSolid, 30);
            Kit.Place((RectTransform)playTile.transform, new Vector2(1, 0), new Vector2(370, 183), new Vector2(-49, 50));
            var pr = Kit.Rect("Row", playTile.transform);
            Kit.Fill(pr);
            Kit.Row(pr, 60, new RectOffset(70, 60, 0, 0), TextAnchor.MiddleRight);
            Kit.Fit(Kit.Text(pr, "Play", 50, Theme.Medium), true, true);
            Kit.Size(Kit.Icon(pr, "play", 64, Theme.Ink), 64, 64);
            Kit.Clickable(playTile.gameObject, () => play());
            reveal.Add((RectTransform)playTile.transform);
            return root;
        }
    }

    /// <summary>The setup prompt's phone glides side to side.</summary>
    public class Sweep : MonoBehaviour
    {
        private Vector2 _home;
        private void Start() => _home = ((RectTransform)transform).anchoredPosition;
        private void Update() =>
            ((RectTransform)transform).anchoredPosition = _home + new Vector2(Mathf.Sin(Time.time * 1.6f) * 140f, 0);
    }

    public class ScoreReveal : MonoBehaviour
    {
        private const float Fade = 0.35f, Rise = 0.55f, Stagger = 0.07f, FillStart = 0.55f, FillLength = 1.3f;

        private readonly List<(RectTransform rt, Vector2 home)> _parts = new List<(RectTransform, Vector2)>();
        private CanvasGroup _group;
        private int _percent;
        private TextMeshProUGUI _label;
        private ScoreRingFill _fill;
        private RectTransform _ring;
        private float _t;
        private bool _chimed;

        public void Configure(int percent, TextMeshProUGUI label, ScoreRingFill fill, RectTransform ring, params RectTransform[] parts)
        {
            _percent = Mathf.Max(0, percent);
            _label = label;
            _fill = fill;
            _ring = ring;
            _group = gameObject.AddComponent<CanvasGroup>();
            _group.alpha = 0;
            foreach (var p in parts) Add(p);
            if (percent < 0) _chimed = true;
        }

        public void Add(RectTransform part)
        {
            _parts.Add((part, part.anchoredPosition));
            part.anchoredPosition += new Vector2(0, -70);
        }

        private static float Out(float x) => 1 - Mathf.Pow(1 - Mathf.Clamp01(x), 3);

        private void Update()
        {
            _t += Time.unscaledDeltaTime;
            _group.alpha = Out(_t / Fade);
            for (var i = 0; i < _parts.Count; i++)
            {
                var k = Out((_t - i * Stagger) / Rise);
                _parts[i].rt.anchoredPosition = _parts[i].home + new Vector2(0, -70 * (1 - k));
            }
            if (_label == null || _fill == null) return;
            var f = Out((_t - FillStart) / FillLength);
            var shown = _percent * f;
            _fill.Set(shown / 100f);
            if (_label.text != "—") _label.text = Mathf.RoundToInt(shown) + "%";
            var done = _t - FillStart - FillLength;
            if (done >= 0)
            {
                var pop = Mathf.Clamp01(done / 0.3f);
                _ring.localScale = Vector3.one * (1 + Mathf.Sin(pop * Mathf.PI) * 0.08f);
                if (!_chimed)
                {
                    _chimed = true;
                    ScoreChime.Play(_percent);
                }
                if (pop >= 1) enabled = false;
            }
        }
    }

    public static class ScoreChime
    {
        private const int Rate = 44100;

        public static void Play(int percent)
        {
            if (!Settings.UiSounds || Settings.Muted) return;
            var notes = percent >= 80 ? new[] { 523.25f, 659.25f, 783.99f, 1046.5f } : percent >= 50 ? new[] { 523.25f, 659.25f, 783.99f } : new[] { 440f, 523.25f };
            var data = new float[(int)(Rate * (0.12f * notes.Length + 0.9f))];
            for (var n = 0; n < notes.Length; n++)
            {
                var s0 = (int)(n * 0.12f * Rate);
                for (var i = 0; i < Rate * 0.9f && s0 + i < data.Length; i++)
                {
                    var t = i / (float)Rate;
                    var env = Mathf.Exp(-t * 4f) * Mathf.Clamp01(t * 400f);
                    data[s0 + i] += (Mathf.Sin(2 * Mathf.PI * notes[n] * t) + 0.3f * Mathf.Sin(4 * Mathf.PI * notes[n] * t)) * env * 0.18f;
                }
            }
            var clip = AudioClip.Create("score", data.Length, 1, Rate, false);
            clip.SetData(data, 0);
            var go = new GameObject("ScoreChime");
            go.AddComponent<AudioSource>().PlayOneShot(clip);
            UnityEngine.Object.Destroy(go, clip.length + 0.2f);
        }
    }
}
