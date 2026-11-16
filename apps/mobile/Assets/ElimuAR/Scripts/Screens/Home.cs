using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace ElimuAR
{
    // The signed-in home: a sidebar (My Library, All Activities, Assignments or Classes, Settings) beside
    // a search bar.
    public static class Home
    {
        public enum Tab { Browse, Library, Assignments, Classes, Settings }

        private const float SideWidth = 538f;
        private const float ContentLeft = 700f;

        private static Tab _tab = Tab.Library;
        private static string _query = "";
        private static string _subject;
        private static string _formFilter, _subjectFilter;
        private static RectTransform _content;
        private static App App => App.Instance;
        private static UiRoot Ui => UiRoot.Instance;

        public static void Show() => Show(_tab);

        public static void Show(Tab tab)
        {
            if (!Session.SignedIn) { AuthScreens.SignIn(); return; }
            if (tab == Tab.Assignments && Session.IsStaff) tab = Tab.Classes;
            if (tab == Tab.Classes && Session.IsStudent) tab = Tab.Assignments;
            if (tab != _tab) { _subject = null; _query = ""; }
            _tab = tab;
            Ui.ShowWhite();
            var screen = Ui.NewScreen("Home");
            BuildSidebar(screen);
            _content = Kit.Rect("Content", screen);
            _content.anchorMin = Vector2.zero;
            _content.anchorMax = Vector2.one;
            _content.offsetMin = new Vector2(ContentLeft, 0);
            _content.offsetMax = new Vector2(-170, 0);
            switch (tab)
            {
                case Tab.Browse: Browse(false); break;
                case Tab.Library: Browse(true); break;
                case Tab.Assignments: Assignments(); break;
                case Tab.Classes: Classes(); break;
                default: SettingsTab(); break;
            }
        }

        // ---- sidebar ------------------------------------------------------------------

        private static RectTransform Top(Transform parent, string name, float y, float height)
        {
            var rt = Kit.Rect(name, parent);
            rt.anchorMin = new Vector2(0, 1);
            rt.anchorMax = new Vector2(1, 1);
            rt.pivot = new Vector2(0, 1);
            rt.offsetMin = new Vector2(0, -y - height);
            rt.offsetMax = new Vector2(0, -y);
            return rt;
        }

        private static void BuildSidebar(RectTransform screen)
        {
            var side = Kit.Panel(screen, "Sidebar", Color.white);
            var rt = (RectTransform)side.transform;
            rt.anchorMin = new Vector2(0, 0);
            rt.anchorMax = new Vector2(0, 1);
            rt.pivot = new Vector2(0, 0.5f);
            rt.sizeDelta = new Vector2(SideWidth, 0);
            var line = Kit.Panel(side.transform, "Divider", Theme.Divider);
            var lrt = (RectTransform)line.transform;
            lrt.anchorMin = new Vector2(1, 0);
            lrt.anchorMax = new Vector2(1, 1);
            lrt.pivot = new Vector2(1, 0.5f);
            lrt.sizeDelta = new Vector2(3, 0);

            var lockup = Brand.Lockup(side.transform, 120);
            lockup.anchorMin = lockup.anchorMax = lockup.pivot = new Vector2(0, 1);
            lockup.anchoredPosition = new Vector2(110, -50);

            SideItem(side.transform, "My Library", Tab.Library, 300);
            SideItem(side.transform, "All Activities", Tab.Browse, 470);
            if (Session.IsStudent) SideItem(side.transform, "Assignments", Tab.Assignments, 640);
            else SideItem(side.transform, "Classes", Tab.Classes, 640);

            var rule = Kit.Panel(side.transform, "Rule", Theme.Divider);
            Kit.Place((RectTransform)rule.transform, new Vector2(0, 1), new Vector2(SideWidth - 70, 3), new Vector2(70, -830));

            var settings = Kit.Panel(side.transform, "Settings", new Color(0, 0, 0, 0));
            Kit.Place((RectTransform)settings.transform, new Vector2(0, 1), new Vector2(SideWidth - 40, 120), new Vector2(40, -860));
            var on = _tab == Tab.Settings;
            var gear = Kit.Icon(settings.transform, "settings", 50, on ? Theme.Brand : Theme.Ink);
            Kit.Place((RectTransform)gear.transform, new Vector2(0, 0.5f), new Vector2(50, 50), new Vector2(76, 0));
            var st = Kit.Text(settings.transform, "Settings", 40, on ? Theme.Bold : Theme.SemiBold, on ? Theme.Brand : Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Place(st.rectTransform, new Vector2(0, 0.5f), new Vector2(300, 80), new Vector2(150, 0));
            Kit.Clickable(settings.gameObject, () => Show(Tab.Settings));
        }

        private static void SideItem(Transform side, string label, Tab tab, float y)
        {
            var on = _tab == tab;
            var row = Kit.Panel(side, label, new Color(0, 0, 0, 0));
            Kit.Place((RectTransform)row.transform, new Vector2(0, 1), new Vector2(SideWidth, 170), new Vector2(0, -y));
            var t = Kit.Text(row.transform, label, 44, Theme.Bold, on ? Theme.Brand : Theme.Ink, TextAlignmentOptions.MidlineLeft);
            t.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Place(t.rectTransform, new Vector2(0, 0.5f), new Vector2(SideWidth - 150, 90), new Vector2(130, 0));
            if (on)
            {
                var bar = Kit.Panel(row.transform, "Bar", Theme.Brand);
                var brt = (RectTransform)bar.transform;
                brt.anchorMin = new Vector2(1, 0);
                brt.anchorMax = new Vector2(1, 1);
                brt.pivot = new Vector2(1, 0.5f);
                brt.sizeDelta = new Vector2(9, 0);
            }
            Kit.Clickable(row.gameObject, () => Show(tab));
        }

        private static string RoleLabel()
        {
            var role = Session.IsStudent ? "Student" : CultureInfo.InvariantCulture.TextInfo.ToTitleCase(Session.Role.Replace('_', ' '));
            var where = !string.IsNullOrEmpty(Session.ClassName) ? Session.ClassName : Session.SchoolName;
            return string.IsNullOrEmpty(where) ? role : role + " · " + where;
        }

        // ---- header: search and title -------------------------------------------------

        private static void SearchBar()
        {
            var field = Kit.Field(_content, "Search for activities");
            var rt = (RectTransform)field.transform;
            rt.anchorMin = new Vector2(0, 1);
            rt.anchorMax = new Vector2(1, 1);
            rt.pivot = new Vector2(0, 1);
            rt.offsetMin = new Vector2(0, -51 - 131);
            rt.offsetMax = new Vector2(0, -51);
            field.GetComponent<Image>().color = Theme.Search;
            UnityEngine.Object.Destroy(field.GetComponent<Outline>());
            field.textViewport.offsetMin = new Vector2(130, 8);
            field.text = _query;
            var glass = Kit.Icon(field.transform, "search", 52, Theme.Ink);
            Kit.Place((RectTransform)glass.transform, new Vector2(0, 0.5f), new Vector2(52, 52), new Vector2(54, 0));
            field.onSubmit.AddListener(v => { _query = v.Trim(); Show(); });
            field.onEndEdit.AddListener(v => { if (v.Trim() != _query) { _query = v.Trim(); Show(); } });
        }

        private static void Title(string title, string note, Action back = null)
        {
            var row = Top(_content, "Title", 245, 100);
            Kit.Row(row, 26, null, TextAnchor.MiddleLeft);
            if (back != null)
            {
                var arrow = Kit.Icon(row, "back", 60, Theme.Ink);
                arrow.raycastTarget = true;
                Kit.Size(arrow, 60, 60);
                Kit.Clickable(arrow.gameObject, () => back());
            }
            var t = Kit.Text(row, title, 66, Theme.Bold);
            t.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Fit(t, true, true);
            if (!string.IsNullOrEmpty(note))
            {
                var n = Kit.Text(row, note, 34, Theme.Regular, Theme.InkSoft, TextAlignmentOptions.MidlineLeft);
                n.textWrappingMode = TextWrappingModes.NoWrap;
                Kit.Fit(n, true, true);
            }
        }

        private static string Count(int n) => n == 1 ? "(1 activity)" : $"({n} activities)";

        // ---- my library / all activities ------------------------------------------------

        private static void Browse(bool library)
        {
            SearchBar();
            IEnumerable<ActivityInfo> list = Catalog.Activities.Where(a => !Catalog.Archived.Contains(a.activityKey));
            if (library) list = list.Where(Catalog.IsInstalled);
            var source = list.ToList();
            var all = Filtered(source);
            var offline = Catalog.Offline ? "(No Internet)" : null;
            FilterBar(source);

            if (!string.IsNullOrEmpty(_query))
            {
                var q = _query.ToLowerInvariant();
                var found = all.Where(a => (a.title ?? "").ToLowerInvariant().Contains(q) ||
                                           (a.description ?? "").ToLowerInvariant().Contains(q) ||
                                           a.tags.Any(tag => tag.ToLowerInvariant().Contains(q))).ToList();
                Title("Results", Count(found.Count), () => { _query = ""; Show(); });
                Cards(found, found.Count == 0 ? "No activities match \"" + _query + "\"." : null);
                return;
            }
            if (_subject != null)
            {
                var inSubject = all.Where(a => SubjectOf(a) == _subject).ToList();
                Title(_subject, Count(inSubject.Count), () => { _subject = null; Show(); });
                FormSections(inSubject);
                return;
            }

            Title(library ? "My Library" : "All Activities", offline);
            if (_formFilter != null || _subjectFilter != null)
            {
                Cards(all, all.Count == 0 ? "No activities match these filters." : null);
                return;
            }
            var subjects = all.GroupBy(SubjectOf).ToList();
            if (subjects.Count == 0)
            {
                var empty = Kit.Text(Top(_content, "Empty", 400, 200), library
                    ? "Activities you download appear here. Find them in All Activities."
                    : "No activities are published yet.", 40, Theme.Medium, Theme.InkSoft);
                Kit.Fill(empty.rectTransform);
                return;
            }
            var host = Grid(new Vector2(768, 560), new Vector2(72, 50));
            foreach (var group in subjects) SubjectTile(host, group.Key, group.ToList());
        }

        private static string SubjectOf(ActivityInfo a) => a.subjectName ?? a.category ?? "Activities";

        private static List<ActivityInfo> Filtered(IEnumerable<ActivityInfo> list) => list.Where(a =>
            (_formFilter == null || FormsOf(a).Contains(_formFilter)) &&
            (_subjectFilter == null || SubjectOf(a) == _subjectFilter)).ToList();

        private static void FilterBar(List<ActivityInfo> source)
        {
            var bar = Kit.Rect("Filters", _content);
            Kit.Place(bar, Vector2.one, new Vector2(1200, 100), new Vector2(0, -245));
            Kit.Row(bar, 20, null, TextAnchor.MiddleRight);
            var forms = source.SelectMany(FormsOf).Distinct().OrderBy(f => f, StringComparer.OrdinalIgnoreCase).ToList();
            var subjects = source.Select(SubjectOf).Distinct().OrderBy(f => f, StringComparer.OrdinalIgnoreCase).ToList();
            FilterChip(bar, "Form", "All forms", _formFilter, forms, v => { _formFilter = v; Show(); });
            FilterChip(bar, "Subject", "All subjects", _subjectFilter, subjects, v => { _subjectFilter = v; Show(); });
        }

        private static void FilterChip(Transform parent, string label, string all, string value, List<string> options, Action<string> pick)
        {
            var on = value != null;
            var chip = Kit.Card(parent, "Filter-" + label, on ? Theme.Ink : Theme.Search, 50);
            var row = Kit.Rect("Row", chip.transform);
            Kit.Fill(row);
            Kit.Row(row, 0, new RectOffset(44, 44, 0, 0), TextAnchor.MiddleCenter);
            var t = Kit.Text(row, label + "  ·  <b>" + (value ?? "All") + "</b>", 36, Theme.Medium, on ? Color.white : Theme.Ink);
            t.textWrappingMode = TextWrappingModes.NoWrap;
            Kit.Fit(t, true, true);
            Kit.Fit(chip, false, true);
            Kit.Size(chip, -1, 96);
            Kit.Clickable(chip.gameObject, () => ChoiceSheet(label, all, value, options, pick));
        }

        private static void ChoiceSheet(string label, string all, string current, List<string> options, Action<string> pick)
        {
            var layer = Kit.Fill(Kit.Rect("Choose " + label, UiRoot.Instance.Overlay));
            Kit.Scrim(layer, null, () => UnityEngine.Object.Destroy(layer.gameObject));
            var card = Kit.Card(layer, "Card", Theme.CardSolid);
            var rows = options.Count + 1;
            Kit.Place((RectTransform)card.transform, new Vector2(0.5f, 0.5f), new Vector2(900, Mathf.Min(900, 170 + rows * 112)), Vector2.zero);
            var title = Kit.Text(card.transform, label, 52, Theme.Bold);
            Kit.Place(title.rectTransform, new Vector2(0, 1), new Vector2(760, 90), new Vector2(70, -40));
            var host = Kit.Rect("List", card.transform);
            Kit.Fill(host);
            host.offsetMin = new Vector2(40, 30);
            host.offsetMax = new Vector2(-40, -140);
            var list = Kit.ScrollList(host, 8, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            void Option(string text, string value)
            {
                var selected = value == current;
                var row = Kit.Card(list, text, selected ? Theme.Tile : new Color(1, 1, 1, 0), 26);
                Kit.Size(row, -1, 104);
                var t = Kit.Text(row.transform, text, 42, selected ? Theme.Bold : Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
                Kit.Fill(t.rectTransform);
                t.rectTransform.offsetMin = new Vector2(40, 0);
                if (selected)
                {
                    var check = Kit.Icon(row.transform, "check", 48, Theme.Brand);
                    Kit.Place((RectTransform)check.transform, new Vector2(1, 0.5f), new Vector2(48, 48), new Vector2(-36, 0));
                }
                Kit.Clickable(row.gameObject, () =>
                {
                    UnityEngine.Object.Destroy(layer.gameObject);
                    pick(value);
                });
            }
            Option(all, null);
            foreach (var o in options) Option(o, o);
        }

        private static RectTransform Grid(Vector2 cell, Vector2 spacing)
        {
            var host = Kit.Rect("Grid", _content);
            host.anchorMin = Vector2.zero;
            host.anchorMax = Vector2.one;
            host.offsetMin = Vector2.zero;
            host.offsetMax = new Vector2(0, -400);
            var grid = Kit.ScrollList(host, 0, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            UnityEngine.Object.DestroyImmediate(grid.GetComponent<VerticalLayoutGroup>());
            var layout = grid.gameObject.AddComponent<GridLayoutGroup>();
            layout.cellSize = cell;
            layout.spacing = spacing;
            layout.padding = new RectOffset(0, 0, 0, 80);
            return grid;
        }

        private static RectTransform Picture(Transform parent, ActivityInfo a, float radius)
        {
            var frame = Kit.Card(parent, "Picture", Theme.Tile, radius);
            frame.gameObject.AddComponent<Mask>().showMaskGraphic = true;
            var raw = Kit.Rect("Image", frame.transform).gameObject.AddComponent<RawImage>();
            Kit.Fill(raw.rectTransform);
            raw.color = new Color(1, 1, 1, 0);
            raw.raycastTarget = false;
            var fitter = raw.gameObject.AddComponent<AspectRatioFitter>();
            fitter.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent;
            App.Run(Catalog.Thumbnail(a, tex =>
            {
                if (raw == null) return;
                raw.texture = tex;
                raw.color = Color.white;
                fitter.aspectRatio = (float)tex.width / Mathf.Max(1, tex.height);
            }));
            return (RectTransform)frame.transform;
        }

        private static void SubjectIcon(Transform parent, string subject, float size)
        {
            var circle = Kit.Panel(parent, "SubjectIcon", Theme.Tile);
            circle.sprite = Kit.CircleSprite();
            Kit.Fill((RectTransform)circle.transform);
            var glyph = Kit.Icon(circle.transform, "flask", size * 0.5f, Theme.Score);
            Kit.Place((RectTransform)glyph.transform, new Vector2(0.5f, 0.5f), new Vector2(size * 0.5f, size * 0.5f), Vector2.zero);
        }

        /// <summary>A subject: its activities' pictures as a collage, then its name and count.</summary>
        private static void SubjectTile(Transform grid, string subject, List<ActivityInfo> activities)
        {
            var tile = Kit.Panel(grid, subject, new Color(0, 0, 0, 0));
            var collage = Kit.Rect("Collage", tile.transform);
            Kit.Place(collage, new Vector2(0, 1), new Vector2(768, 386), Vector2.zero);
            if (activities.Count == 1)
            {
                Kit.Fill(Picture(collage, activities[0], 19));
            }
            else
            {
                Kit.Place(Picture(collage, activities[0], 19), new Vector2(0, 1), new Vector2(576, 386), Vector2.zero);
                for (var i = 1; i < Mathf.Min(3, activities.Count); i++)
                    Kit.Place(Picture(collage, activities[i], 19), new Vector2(0, 1), new Vector2(180, 187), new Vector2(588, -(i - 1) * 199));
            }
            var foot = Kit.Rect("Foot", tile.transform);
            Kit.Place(foot, new Vector2(0, 1), new Vector2(768, 130), new Vector2(0, -410));
            var icon = Kit.Rect("IconSlot", foot);
            Kit.Place(icon, new Vector2(0, 0.5f), new Vector2(117, 117), new Vector2(0, 0));
            SubjectIcon(icon, subject, 117);
            var count = activities.Count == 1 ? "1 activity" : activities.Count + " activities";
            var text = Kit.Text(foot, "<b>" + subject + "</b>\n<size=82%><color=#6B6B6B>" + count + "</color></size>",
                44, Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Place(text.rectTransform, new Vector2(0, 0.5f), new Vector2(600, 130), new Vector2(147, 0));
            Kit.Clickable(tile.gameObject, () => { _subject = subject; Show(); });
        }

        /// <summary>The forms an activity is listed under ("Form 1, Form 2").</summary>
        private static IEnumerable<string> FormsOf(ActivityInfo a) =>
            (a.gradeLevel ?? "").Split(',').Select(f => f.Trim()).Where(f => f.Length > 0).DefaultIfEmpty("All forms");

        /// <summary>The learner's own form, read from their class ("Form 1 - Computer Science").</summary>
        private static string OwnForm()
        {
            var m = System.Text.RegularExpressions.Regex.Match(Session.ClassName ?? "", @"Form\s*\d+", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return m.Success ? m.Value : null;
        }

        /// <summary>A subject's activities, one section per form, the learner's own form first.</summary>
        private static void FormSections(List<ActivityInfo> activities)
        {
            if (activities.Count == 0)
            {
                Cards(activities, "Nothing here yet.");
                return;
            }
            var own = OwnForm();
            var forms = activities.SelectMany(FormsOf).Distinct()
                .OrderBy(f => own != null && f.Equals(own, StringComparison.OrdinalIgnoreCase) ? 0 : 1)
                .ThenBy(f => f, StringComparer.OrdinalIgnoreCase).ToList();

            var host = Kit.Rect("Forms", _content);
            host.anchorMin = Vector2.zero;
            host.anchorMax = Vector2.one;
            host.offsetMin = Vector2.zero;
            host.offsetMax = new Vector2(0, -380);
            var list = Kit.ScrollList(host, 30, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            foreach (var form in forms)
            {
                var inForm = activities.Where(a => FormsOf(a).Contains(form)).ToList();
                var label = form + (own != null && form.Equals(own, StringComparison.OrdinalIgnoreCase) ? "  (your form)" : "");
                var head = Kit.Text(list, "<b>" + label + "</b>   <size=80%><color=#6B6B6B>" + Count(inForm.Count) + "</color></size>",
                    48, Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
                Kit.Size(head, -1, 80);
                var grid = Kit.Rect("Grid " + form, list);
                var layout = grid.gameObject.AddComponent<GridLayoutGroup>();
                layout.cellSize = new Vector2(487, 520);
                layout.spacing = new Vector2(72, 40);
                layout.padding = new RectOffset(0, 0, 0, 30);
                foreach (var a in inForm) ActivityCard(grid, a);
            }
        }

        private static void Cards(List<ActivityInfo> activities, string empty)
        {
            if (!string.IsNullOrEmpty(empty))
            {
                var t = Kit.Text(Top(_content, "Empty", 400, 200), empty, 40, Theme.Medium, Theme.InkSoft);
                Kit.Fill(t.rectTransform);
                return;
            }
            var grid = Grid(new Vector2(487, 520), new Vector2(72, 40));
            foreach (var a in activities) ActivityCard(grid, a);
        }

        /// <summary>An activity card: picture, subject mark, title and size.</summary>
        private static void ActivityCard(Transform parent, ActivityInfo a)
        {
            var card = Kit.Panel(parent, a.title, new Color(0, 0, 0, 0));
            var picture = Picture(card.transform, a, 23);
            Kit.Place(picture, new Vector2(0, 1), new Vector2(487, 288), Vector2.zero);

            if (Catalog.StateOf(a) != InstallState.Installed)
            {
                var badge = Kit.Card(picture, "Download", new Color(1, 1, 1, 0.92f), 30);
                Kit.Place((RectTransform)badge.transform, new Vector2(1, 1), new Vector2(66, 66), new Vector2(-14, -14));
                var d = Kit.Icon(badge.transform, "download", 40, Theme.Ink);
                Kit.Place((RectTransform)d.transform, new Vector2(0.5f, 0.5f), new Vector2(40, 40), Vector2.zero);
            }

            var mark = Kit.Panel(card.transform, "Mark", Theme.Tile);
            mark.sprite = Kit.CircleSprite();
            Kit.Place((RectTransform)mark.transform, new Vector2(0, 1), new Vector2(50, 50), new Vector2(0, -312));
            var flask = Kit.Icon(mark.transform, "flask", 30, Theme.Ink);
            Kit.Place((RectTransform)flask.transform, new Vector2(0.5f, 0.5f), new Vector2(30, 30), Vector2.zero);
            var title = Kit.Text(card.transform, a.title, 42, Theme.Bold);
            Kit.Place(title.rectTransform, new Vector2(0, 1), new Vector2(400, 110), new Vector2(68, -300));
            var best = Session.IsStudent ? Scores.Best(a.activityKey) : -1;
            var meta = Kit.Text(card.transform, a.SizeLabel.Replace(" ", "") + (best >= 0 ? "   ·   " + best + "%" : ""), 34, Theme.Regular, Theme.InkSoft);
            Kit.Place(meta.rectTransform, new Vector2(0, 1), new Vector2(400, 50), new Vector2(68, -410));

            var info = Kit.Panel(card.transform, "Info", new Color(0, 0, 0, 0));
            Kit.Place((RectTransform)info.transform, new Vector2(1, 1), new Vector2(70, 70), new Vector2(0, -300));
            var dots = Kit.Icon(info.transform, "more", 44, Theme.InkSoft);
            Kit.Place((RectTransform)dots.transform, new Vector2(0.5f, 0.5f), new Vector2(44, 44), Vector2.zero);
            Kit.Clickable(info.gameObject, () => Detail(a));

            Kit.Clickable(card.gameObject, () => Open(a));
        }

        /// <summary>Installed: open it. Not installed: offer the download, then open it.</summary>
        public static void Open(ActivityInfo a)
        {
            var state = Catalog.StateOf(a);
            if (state == InstallState.Installed)
            {
                App.Runner.Open(a);
                return;
            }
            var update = state == InstallState.UpdateAvailable;
            Ui.Confirm(update ? "Update Activity?" : "Download Activity?",
                a.title + " needs to be " + (update ? "updated" : "downloaded") + " before it can be played (" +
                a.SizeLabel.Replace(" ", "") + "). It will then open without the internet.",
                "Download", "Cancel", () => App.Run(DownloadThenOpen(a)));
        }

        private static IEnumerator DownloadThenOpen(ActivityInfo a, AssignmentRun assignment = null)
        {
            var busy = Ui.Busy("Downloading " + a.title + "...");
            var label = busy.GetComponentsInChildren<TextMeshProUGUI>().LastOrDefault();
            string error = null;
            var done = false;
            yield return Catalog.Install(a, p => { if (label != null) label.text = "Downloading " + a.title + "... " + Mathf.RoundToInt(p * 100) + "%"; },
                () => done = true, e => error = e);
            UnityEngine.Object.Destroy(busy.gameObject);
            if (!done)
            {
                Ui.Notice("Download failed", error ?? "Check the Wi-Fi and try again.");
                yield break;
            }
            if (Catalog.Archived.Contains(a.activityKey)) yield return Catalog.SetArchived(a, false);
            App.Runner.Open(a, assignment);
        }

        // ---- the detail sheet ---------------------------------------------------------------

        public static void Detail(ActivityInfo a)
        {
            var layer = Kit.Fill(Kit.Rect("Detail", Ui.Overlay));
            Kit.Scrim(layer, null, () => UnityEngine.Object.Destroy(layer.gameObject));
            var sheet = Kit.Card(layer, "Sheet", Theme.CardSolid, 56);
            Kit.Place((RectTransform)sheet.transform, new Vector2(0.5f, 0.5f), new Vector2(1900, 940), Vector2.zero);
            Kit.Clickable(sheet.gameObject, null).transition = Selectable.Transition.None;

            var thumb = Kit.Card(sheet.transform, "Thumb", Color.white, 40);
            Kit.Place((RectTransform)thumb.transform, new Vector2(0, 1), new Vector2(640, 640), new Vector2(60, -60));
            var raw = Kit.Rect("Image", thumb.transform).gameObject.AddComponent<RawImage>();
            Kit.Fill(raw.rectTransform, 24);
            raw.color = new Color(1, 1, 1, 0);
            var fitter = raw.gameObject.AddComponent<AspectRatioFitter>();
            fitter.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
            App.Run(Catalog.Thumbnail(a, tex =>
            {
                if (raw == null) return;
                raw.texture = tex;
                raw.color = Color.white;
                fitter.aspectRatio = (float)tex.width / Mathf.Max(1, tex.height);
            }));
            var mode = Kit.Text(sheet.transform, a.maxUsers > 1 ? "Group Play" : "Solo Play", 36, Theme.SemiBold, Theme.InkSoft,
                TextAlignmentOptions.Center);
            Kit.Place(mode.rectTransform, new Vector2(0, 1), new Vector2(640, 60), new Vector2(60, -720));

            var close = Kit.Panel(sheet.transform, "Close", new Color(0, 0, 0, 0));
            Kit.Place((RectTransform)close.transform, Vector2.one, new Vector2(120, 120), new Vector2(-30, -30));
            var x = Kit.Icon(close.transform, "close", 60, Theme.Ink);
            Kit.Place((RectTransform)x.transform, new Vector2(0.5f, 0.5f), new Vector2(60, 60), Vector2.zero);
            Kit.Clickable(close.gameObject, () => UnityEngine.Object.Destroy(layer.gameObject));

            var right = Kit.Rect("Info", sheet.transform);
            right.anchorMin = new Vector2(0, 0);
            right.anchorMax = new Vector2(1, 1);
            right.offsetMin = new Vector2(760, 230);
            right.offsetMax = new Vector2(-150, -60);
            var info = Kit.ScrollList(right, 18, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            var titleRow = Kit.Rect("TitleRow", info);
            Kit.Row(titleRow, 24, null, TextAnchor.MiddleLeft);
            Kit.Fit(titleRow);
            var title = Kit.Text(titleRow, a.title, Theme.TitleSize, Theme.Bold);
            Kit.Fit(title, true, true);
            if (IsNew(a))
            {
                var ring = Kit.Card(titleRow, "New", Theme.Brand, 30);
                Kit.Row(ring.transform, 0, new RectOffset(24, 24, 8, 8), TextAnchor.MiddleCenter);
                Kit.Fit(ring, true, true);
                Kit.Fit(Kit.Text(ring.transform, "New", 30, Theme.Bold, Color.white), true, true);
            }
            var state = Catalog.StateOf(a);
            var stateLabel = state == InstallState.Installed ? "Installed" : state == InstallState.UpdateAvailable ? "Update available" : "Not Installed";
            Kit.Fit(Kit.Text(info, $"v{a.version}  ·  {a.SizeLabel}  ·  {stateLabel}", 36, Theme.Medium, Theme.InkSoft));
            Kit.Rule(info, 1, 0);
            Kit.Fit(Kit.Text(info, a.Body, 40, Theme.Medium));
            if (!string.IsNullOrEmpty(a.Tip)) Kit.Fit(Kit.Text(info, "<b>Tip:</b> " + a.Tip, 38, Theme.Medium, Theme.InkSoft));
            if (a.tags.Count > 0) Kit.Fit(Kit.Text(info, string.Join("   ", a.tags.Select(t => "#" + t)), 34, Theme.SemiBold, Theme.BrandDark));
            var best = Session.IsStudent ? Scores.Best(a.activityKey) : -1;
            if (best >= 0)
            {
                var row = Kit.Rect("Score", info);
                Kit.Row(row, 24, null, TextAnchor.MiddleLeft);
                Kit.Size(row, -1, 110);
                Kit.Fit(Kit.Text(row, "Your Current High Score", 38, Theme.Bold), true, true);
                Kit.Fit(Kit.Text(row, best + "%", 54, Theme.Bold, Theme.Score), true, true);
                Kit.ScoreRing(row, 96, best);
            }

            var progress = Kit.Text(sheet.transform, "", 36, Theme.SemiBold, Theme.BrandDark, TextAlignmentOptions.MidlineLeft);
            Kit.Place(progress.rectTransform, new Vector2(0, 0), new Vector2(1000, 60), new Vector2(760, 170));

            var buttons = Kit.Rect("Buttons", sheet.transform);
            Kit.Place(buttons, new Vector2(1, 0), new Vector2(1700, 130), new Vector2(-60, 50));
            Kit.Row(buttons, 24, null, TextAnchor.MiddleRight).childForceExpandWidth = false;
            var archived = Catalog.Archived.Contains(a.activityKey);

            Kit.Size(Kit.Wide(buttons, archived ? "Unarchive" : "Archive", () =>
            {
                if (archived)
                {
                    App.Run(Catalog.SetArchived(a, false));
                    UnityEngine.Object.Destroy(layer.gameObject);
                    Show();
                    return;
                }
                Ui.Confirm("Archive Activity?",
                    "It is removed from this device and your library. Your score is kept, and you can install it again any time.",
                    "Archive", "Cancel", () =>
                    {
                        App.Run(Catalog.SetArchived(a, true));
                        UnityEngine.Object.Destroy(layer.gameObject);
                        Show();
                    });
            }, false, "archive"), 330, 124);

            if (state == InstallState.NotInstalled || state == InstallState.UpdateAvailable)
            {
                Button get = null;
                get = Kit.Wide(buttons, state == InstallState.UpdateAvailable ? "Update" : "Install", () =>
                {
                    Ui.Confirm(state == InstallState.UpdateAvailable ? "Update Activity?" : "Download Activity?",
                        $"{a.title} is {a.SizeLabel}. Downloading over Wi-Fi is best.", "Download", "Cancel", () =>
                        {
                            get.interactable = false;
                            App.Run(Catalog.Install(a,
                                p => { if (progress != null) progress.text = $"Downloading... {Mathf.RoundToInt(p * 100)}%"; },
                                () =>
                                {
                                    if (archived) App.Run(Catalog.SetArchived(a, false));
                                    UnityEngine.Object.Destroy(layer.gameObject);
                                    Ui.Toast(a.title + " is ready. It opens without a network now.");
                                    Show();
                                    Detail(a);
                                },
                                e =>
                                {
                                    if (progress != null) { progress.color = Theme.Wrong; progress.text = e; }
                                    if (get != null) get.interactable = true;
                                }));
                        });
                }, true, "download");
                Kit.Size(get, 400, 124);
            }
            if (state != InstallState.NotInstalled && Session.Role == "platform_admin")
            {
                Kit.Size(Kit.Wide(buttons, "Web Preview", () =>
                {
                    UnityEngine.Object.Destroy(layer.gameObject);
                    App.Recorder.Record(a);
                }, false, "camera"), 380, 124);
            }
            if (state != InstallState.NotInstalled)
            {
                Kit.Size(Kit.Wide(buttons, "Start Activity", () =>
                {
                    UnityEngine.Object.Destroy(layer.gameObject);
                    App.Runner.Open(a);
                }, true, "play"), 460, 124);
            }
        }

        private static bool IsNew(ActivityInfo a) =>
            DateTime.TryParse(a.updatedAt, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal, out var when) &&
            (DateTime.UtcNow - when).TotalDays < 14 && Session.IsStudent && Scores.Best(a.activityKey) < 0;

        // ---- assignments (students) ------------------------------------------------------------

        private static void Assignments()
        {
            Title("Assignments", null);
            var host = Kit.Rect("List", _content);
            host.anchorMin = Vector2.zero;
            host.anchorMax = Vector2.one;
            host.offsetMin = Vector2.zero;
            host.offsetMax = new Vector2(0, -380);
            var list = Kit.ScrollList(host, 24, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            var loading = Kit.Text(list, "Loading...", Theme.BodySize, Theme.Medium, Theme.InkSoft);
            Kit.Fit(loading);
            App.Run(Api.Get("/api/assignments/me", data =>
            {
                if (list == null) return;
                Kit.Clear(list);
                var rows = (JArray)data;
                PlayerPrefs.SetString("assignmentsCache", rows.ToString());
                FillAssignments(list, rows);
            }, f =>
            {
                if (list == null) return;
                Kit.Clear(list);
                var cached = PlayerPrefs.GetString("assignmentsCache", "");
                if (f.Offline && cached.Length > 0)
                {
                    Kit.Fit(Kit.Text(list, "Offline: showing the assignments last seen on this device.", 34, Theme.Medium, Theme.InkSoft));
                    FillAssignments(list, JArray.Parse(cached));
                }
                else Kit.Fit(Kit.Text(list, f.Message, Theme.BodySize, Theme.Medium, Theme.Wrong));
            }));
        }

        private static void FillAssignments(Transform list, JArray rows)
        {
            if (rows.Count == 0)
            {
                Kit.Fit(Kit.Text(list, "Nothing is assigned right now. Explore any activity from Home.", Theme.BodySize, Theme.Medium, Theme.InkSoft));
                return;
            }
            foreach (var r in rows)
            {
                var run = AssignmentRun.From(r);
                var activity = run.ActivityKey != null ? Catalog.Find(run.ActivityKey) : null;
                var card = Kit.Card(list, "Assignment", Theme.CardSolid, 40);
                Kit.Size(card, -1, 220);
                var t = Kit.Text(card.transform, run.Title, 50, Theme.Bold);
                Kit.Place(t.rectTransform, new Vector2(0, 1), new Vector2(1200, 70), new Vector2(50, -36));
                var meta = Kit.Text(card.transform, run.ClassName + "  ·  " + Rules(run), 34, Theme.Medium, Theme.InkSoft);
                Kit.Place(meta.rectTransform, new Vector2(0, 1), new Vector2(1250, 100), new Vector2(50, -112));
                var queued = Scores.QueuedSubmissions(run.Id) > 0;
                var (label, colour) = run.BestScore.HasValue ? ("Handed in · " + run.BestScore + "%", Theme.BrandDark)
                    : queued ? ("Handed in · waiting to sync", Theme.BrandDark)
                    : run.Closed ? ("Closed", Theme.Wrong)
                    : ("Not started", Theme.Score);
                var status = Kit.Text(card.transform, label, 40, Theme.Bold, colour, TextAlignmentOptions.MidlineRight);
                Kit.Place(status.rectTransform, new Vector2(1, 0.5f), new Vector2(560, 80), new Vector2(-60, 0));
                Kit.Clickable(card.gameObject, () =>
                {
                    if (activity != null) AssignmentSheet(activity, run);
                    else Ui.Notice("Not available", "This assignment's activity is not published yet. Ask your teacher.");
                });
            }
        }

        /// <summary>Due time, time limit and attempts, on one line.</summary>
        private static string Rules(AssignmentRun run)
        {
            var parts = new List<string> { run.DueAt.HasValue ? "Due " + When(run.DueAt.Value) : "No due date" };
            if (run.TimeLimitMinutes > 0) parts.Add(run.TimeLimitMinutes + " min");
            if (run.AttemptsAllowed > 0) parts.Add($"{run.AttemptsTaken} of {run.AttemptsAllowed} attempts used");
            return string.Join("  ·  ", parts);
        }

        // An assignment before it starts: what it is, the rules it is played under, and Start (downloading
        // the activity first if it is not here).
        private static void AssignmentSheet(ActivityInfo a, AssignmentRun run)
        {
            var layer = Kit.Fill(Kit.Rect("Assignment", Ui.Overlay));
            Kit.Scrim(layer, null, () => UnityEngine.Object.Destroy(layer.gameObject));
            var sheet = Kit.Card(layer, "Sheet", Theme.CardSolid, 56);
            Kit.Place((RectTransform)sheet.transform, new Vector2(0.5f, 0.5f), new Vector2(1600, 900), Vector2.zero);
            Kit.Clickable(sheet.gameObject, null).transition = Selectable.Transition.None;

            var close = Kit.Panel(sheet.transform, "Close", new Color(0, 0, 0, 0));
            Kit.Place((RectTransform)close.transform, Vector2.one, new Vector2(120, 120), new Vector2(-30, -30));
            var x = Kit.Icon(close.transform, "close", 60, Theme.Ink);
            Kit.Place((RectTransform)x.transform, new Vector2(0.5f, 0.5f), new Vector2(60, 60), Vector2.zero);
            Kit.Clickable(close.gameObject, () => UnityEngine.Object.Destroy(layer.gameObject));

            var body = Kit.Rect("Body", sheet.transform);
            body.anchorMin = Vector2.zero;
            body.anchorMax = Vector2.one;
            body.offsetMin = new Vector2(80, 210);
            body.offsetMax = new Vector2(-160, -70);
            var info = Kit.ScrollList(body, 20, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            Kit.Fit(Kit.Text(info, "Assignment  ·  " + run.ClassName, 36, Theme.SemiBold, Theme.BrandDark));
            Kit.Fit(Kit.Text(info, run.Title, Theme.TitleSize, Theme.Bold));
            Kit.Rule(info, 1, 0);
            Kit.Fit(Kit.Text(info, Rules(run), 40, Theme.SemiBold));
            if (!string.IsNullOrEmpty(run.TeacherNote)) Kit.Fit(Kit.Text(info, "“" + run.TeacherNote + "”", 38, Theme.Medium, Theme.InkSoft));
            if (run.BestScore.HasValue) Kit.Fit(Kit.Text(info, "Your best so far: <b>" + run.BestScore + "%</b>", 38, Theme.Medium));
            Kit.Fit(Kit.Text(info,
                "• Once the questions begin you cannot go back.\n" +
                "• Leaving after that hands in your work.\n" +
                (run.DueAt.HasValue || run.TimeLimitMinutes > 0 ? "• When the time runs out your work is handed in.\n" : "") +
                "• It works offline; your work goes up when you are back online.",
                36, Theme.Medium, Theme.InkSoft));

            var buttons = Kit.Rect("Buttons", sheet.transform);
            Kit.Place(buttons, new Vector2(1, 0), new Vector2(1400, 130), new Vector2(-60, 50));
            Kit.Row(buttons, 24, null, TextAnchor.MiddleRight).childForceExpandWidth = false;
            Kit.Size(Kit.Wide(buttons, "Cancel", () => UnityEngine.Object.Destroy(layer.gameObject), false), 300, 124);
            var why = run.Closed ? "Closed: the due time has passed."
                : run.OutOfAttempts ? "No attempts left."
                : null;
            if (why != null)
            {
                var note = Kit.Text(sheet.transform, why, 38, Theme.Bold, Theme.Wrong, TextAlignmentOptions.MidlineLeft);
                Kit.Place(note.rectTransform, new Vector2(0, 0), new Vector2(900, 124), new Vector2(80, 50));
                return;
            }
            var installed = Catalog.StateOf(a) == InstallState.Installed;
            Kit.Size(Kit.Wide(buttons, installed ? "Start Assignment" : "Download and Start", () =>
            {
                UnityEngine.Object.Destroy(layer.gameObject);
                if (installed) App.Runner.Open(a, run);
                else App.Run(DownloadThenOpen(a, run));
            }, true, installed ? "play" : "download"), 560, 124);
        }

        private static string When(DateTime utc) => utc.ToLocalTime().ToString("ddd d MMM, HH:mm", CultureInfo.InvariantCulture);

        // ---- classes (teachers) --------------------------------------------------------------------

        private static string _classId;

        private static void Classes()
        {
            Title("Classes", null);
            var left = Kit.Card(_content, "ClassList", Theme.Card);
            var lrt = (RectTransform)left.transform;
            lrt.anchorMin = new Vector2(0, 0);
            lrt.anchorMax = new Vector2(0, 1);
            lrt.pivot = new Vector2(0, 0.5f);
            lrt.offsetMin = new Vector2(0, Theme.Margin);
            lrt.offsetMax = new Vector2(520, -380);
            var classes = Kit.ScrollList(left.transform, 12, out var cs);
            Kit.Fill((RectTransform)cs.transform, 24);

            var detail = Kit.Card(_content, "ClassDetail", Theme.Card);
            var drt = (RectTransform)detail.transform;
            drt.anchorMin = new Vector2(0, 0);
            drt.anchorMax = new Vector2(1, 1);
            drt.offsetMin = new Vector2(560, Theme.Margin);
            drt.offsetMax = new Vector2(0, -380);

            Kit.Fit(Kit.Text(classes, "Loading...", 38, Theme.Medium, Theme.InkSoft));
            App.Run(Api.Get("/api/teachers/me/classes", data =>
            {
                if (classes == null) return;
                Kit.Clear(classes);
                var rows = (JArray)data;
                if (rows.Count == 0)
                {
                    Kit.Fit(Kit.Text(classes, "No classes are assigned to you yet. Ask your school admin.", 36, Theme.Medium, Theme.InkSoft));
                    return;
                }
                if (_classId == null || rows.All(r => r.Value<string>("classId") != _classId)) _classId = rows[0].Value<string>("classId");
                foreach (var r in rows)
                {
                    var id = r.Value<string>("classId");
                    var on = id == _classId;
                    var row = Kit.Card(classes, "Class", on ? Theme.Brand : Color.white, 26);
                    Kit.Size(row, -1, 110);
                    var t = Kit.Text(row.transform, ClassLabel(r, on), 38, on ? Theme.Bold : Theme.Medium,
                        on ? Color.white : Theme.Ink, TextAlignmentOptions.MidlineLeft);
                    Kit.Fill(t.rectTransform);
                    t.rectTransform.offsetMin = new Vector2(36, 0);
                    Kit.Clickable(row.gameObject, () => { _classId = id; Show(Tab.Classes); });
                    if (on) ClassDetail(detail.transform, r);
                }
            }, f =>
            {
                if (classes == null) return;
                Kit.Clear(classes);
                Kit.Fit(Kit.Text(classes, f.Message, 36, Theme.Medium, Theme.Wrong));
            }));
        }

        /// <summary>"Form 1" with its subject beside it, never inside the name.</summary>
        private static string ClassLabel(JToken klass, bool selected)
        {
            var subject = klass.Value<string>("subject");
            var tone = selected ? "#FFFFFFCC" : "#6B6B6B";
            return klass.Value<string>("className") +
                   (string.IsNullOrEmpty(subject) ? "" : "<size=72%><color=" + tone + ">   " + subject + "</color></size>");
        }

        private static void ClassDetail(Transform card, JToken klass)
        {
            var classId = klass.Value<string>("classId");
            var title = Kit.Text(card, ClassLabel(klass, false), 60, Theme.Bold);
            Kit.Place(title.rectTransform, new Vector2(0, 1), new Vector2(900, 80), new Vector2(50, -40));
            var assign = Kit.Wide(card, "Assign Activity", () => AssignDialog(klass), true, "assign", 110);
            Kit.Place((RectTransform)assign.transform, Vector2.one, new Vector2(470, 110), new Vector2(-40, -30));
            var host = Kit.Rect("Body", card);
            host.anchorMin = Vector2.zero;
            host.anchorMax = Vector2.one;
            host.offsetMin = new Vector2(40, 30);
            host.offsetMax = new Vector2(-40, -160);
            var body = Kit.ScrollList(host, 12, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            Kit.Fit(Kit.Text(body, "Loading class progress...", 36, Theme.Medium, Theme.InkSoft));

            JToken progress = null, assignments = null;
            string error = null;
            App.Run(Load());
            IEnumerator Load()
            {
                yield return Api.Get("/api/ar-activities/progress/class/" + classId, d => progress = d, f => error = f.Message);
                yield return Api.Get("/api/assignments", d => assignments = d, f => error = error ?? f.Message);
                if (body == null) yield break;
                Kit.Clear(body);
                if (progress == null) { Kit.Fit(Kit.Text(body, error, 36, Theme.Medium, Theme.Wrong)); yield break; }

                Kit.Fit(Kit.Text(body, "Assigned", 42, Theme.Bold));
                var count = 0;
                foreach (var a in (JArray)assignments ?? new JArray())
                {
                    if (a.Value<string>("classId") != classId) continue;
                    count++;
                    var due = a["dueAt"] != null && a["dueAt"].Type != JTokenType.Null ? " · due " + When(a.Value<DateTime>("dueAt")) : "";
                    Kit.Fit(Kit.Text(body, $"<b>{a.Value<string>("lessonTitle")}</b>  ·  {a.Value<int>("completedCount")} of {a.Value<int>("studentCount")} done" +
                        $"  ·  average {a.Value<int>("averageScore")}%{due}", 34, Theme.Medium, Theme.InkSoft));
                }
                if (count == 0) Kit.Fit(Kit.Text(body, "Nothing assigned to this class yet.", 34, Theme.Medium, Theme.InkSoft));

                var gap = Kit.Rect("Gap", body);
                Kit.Size(gap, -1, 20);
                Kit.Fit(Kit.Text(body, "Learner scores (best)", 42, Theme.Bold));
                var activities = Catalog.Activities;
                TableRow(body, "Learner", activities.Select(a => a.title).ToList(), true);
                var records = (JArray)progress["records"] ?? new JArray();
                var students = (JArray)progress["students"] ?? new JArray();
                foreach (var s in students)
                {
                    var sid = s.Value<string>("studentId");
                    var cells = activities.Select(a =>
                    {
                        var rec = records.FirstOrDefault(r => r.Value<string>("studentId") == sid && r.Value<string>("activityKey") == a.activityKey);
                        var best = rec?["bestScorePercent"];
                        return best == null || best.Type == JTokenType.Null ? "—" : Mathf.RoundToInt((float)best) + "%";
                    }).ToList();
                    TableRow(body, s.Value<string>("studentName"), cells, false);
                }
                if (students.Count == 0) Kit.Fit(Kit.Text(body, "No learners are enrolled in this class.", 34, Theme.Medium, Theme.InkSoft));
            }
        }

        private static void TableRow(Transform parent, string name, List<string> cells, bool head)
        {
            var row = Kit.Card(parent, "Row", head ? Theme.Hex(0xEDEDED) : Color.white, 18);
            Kit.Size(row, -1, 84);
            var h = Kit.Row(row.transform, 10, new RectOffset(28, 28, 0, 0), TextAnchor.MiddleLeft);
            h.childForceExpandWidth = false;
            var n = Kit.Text(row.transform, name, 32, head ? Theme.Bold : Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Size(n, 420, 70);
            foreach (var c in cells)
            {
                var color = Theme.Ink;
                if (!head && c.EndsWith("%")) color = int.Parse(c.TrimEnd('%')) >= 70 ? Theme.BrandDark : Theme.Score;
                if (!head && c == "—") color = Theme.InkFaint;
                var t = Kit.Text(row.transform, c, head ? 28 : 34, head ? Theme.Bold : Theme.SemiBold, color, TextAlignmentOptions.Center);
                Kit.Size(t, 280, 70);
            }
        }

        private static void AssignDialog(JToken klass)
        {
            var activities = Catalog.Activities;
            if (activities.Count == 0) { Ui.Notice("Nothing to assign", "No activities are published yet."); return; }
            var layer = Kit.Fill(Kit.Rect("Assign", Ui.Overlay));
            Kit.Scrim(layer);
            var card = Kit.Card(layer, "Card", Theme.CardSolid);
            Kit.Place((RectTransform)card.transform, new Vector2(0.5f, 0.5f), new Vector2(1500, 900), Vector2.zero);
            var t = Kit.Text(card.transform, "Assign to " + ClassLabel(klass, false), Theme.HeadingSize, Theme.Bold);
            Kit.Place(t.rectTransform, new Vector2(0, 1), new Vector2(1300, 90), new Vector2(70, -50));

            var picked = 0;
            var windows = new[] { ("45 minutes", 45), ("2 hours", 120), ("Until tomorrow", 1440) };
            var window = 2;
            var list = Kit.Rect("Activities", card.transform);
            list.anchorMin = new Vector2(0, 0);
            list.anchorMax = new Vector2(1, 1);
            list.offsetMin = new Vector2(70, 380);
            list.offsetMax = new Vector2(-70, -170);
            var rows = Kit.ScrollList(list, 12, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);
            var rowImages = new List<Image>();
            for (var i = 0; i < activities.Count; i++)
            {
                var index = i;
                var row = Kit.Card(rows, "Activity", i == 0 ? Theme.Brand : Color.white, 24);
                Kit.Size(row, -1, 96);
                var label = Kit.Text(row.transform, activities[i].title, 38, Theme.SemiBold, Theme.Ink, TextAlignmentOptions.MidlineLeft);
                Kit.Fill(label.rectTransform);
                label.rectTransform.offsetMin = new Vector2(36, 0);
                rowImages.Add(row);
                Kit.Clickable(row.gameObject, () =>
                {
                    picked = index;
                    for (var k = 0; k < rowImages.Count; k++) rowImages[k].color = k == index ? Theme.Brand : Color.white;
                });
            }
            var openFor = Kit.Text(card.transform, "Open for", 38, Theme.Bold);
            Kit.Place(openFor.rectTransform, new Vector2(0, 0), new Vector2(300, 80), new Vector2(70, 270));
            var chips = Kit.Rect("Window", card.transform);
            Kit.Place(chips, new Vector2(0, 0), new Vector2(1100, 96), new Vector2(330, 262));
            Kit.Row(chips, 16, null, TextAnchor.MiddleLeft);
            var chipImages = new List<Image>();
            for (var i = 0; i < windows.Length; i++)
            {
                var index = i;
                var chip = Kit.Card(chips, windows[i].Item1, i == window ? Theme.Ink : Color.white, 40);
                Kit.Row(chip.transform, 0, new RectOffset(36, 36, 16, 16), TextAnchor.MiddleCenter);
                Kit.Fit(chip, true, true);
                var label = Kit.Text(chip.transform, windows[i].Item1, 34, Theme.SemiBold, i == window ? Color.white : Theme.Ink);
                label.textWrappingMode = TextWrappingModes.NoWrap;
                Kit.Fit(label, true, true);
                chipImages.Add(chip);
                Kit.Clickable(chip.gameObject, () =>
                {
                    window = index;
                    for (var k = 0; k < chipImages.Count; k++)
                    {
                        chipImages[k].color = k == index ? Theme.Ink : Color.white;
                        chipImages[k].GetComponentInChildren<TextMeshProUGUI>().color = k == index ? Color.white : Theme.Ink;
                    }
                });
            }
            var note = Kit.Field(card.transform, "Note for learners (optional)");
            Kit.Place((RectTransform)note.transform, new Vector2(0, 0), new Vector2(860, 112), new Vector2(70, 60));
            var cancel = Kit.Wide(card.transform, "Cancel", () => UnityEngine.Object.Destroy(layer.gameObject), false);
            Kit.Place((RectTransform)cancel.transform, new Vector2(1, 0), new Vector2(240, 112), new Vector2(-370, 60));
            var go = Kit.Wide(card.transform, "Assign", () =>
            {
                var a = activities[picked];
                var body = new JObject
                {
                    ["lessonId"] = a.lessonId,
                    ["classId"] = klass.Value<string>("classId"),
                    ["startsNow"] = true,
                    ["durationMinutes"] = windows[window].Item2,
                    ["attemptsAllowed"] = 3,
                    ["hintsEnabled"] = false,
                    ["requireSubmission"] = false,
                };
                if (!string.IsNullOrEmpty(note.text.Trim())) body["teacherNote"] = note.text.Trim();
                App.Run(Api.Post("/api/assignments", body, _ =>
                {
                    UnityEngine.Object.Destroy(layer.gameObject);
                    Ui.Toast(a.title + " assigned.");
                    Show(Tab.Classes);
                }, f => Ui.Notice("Not assigned", f.Message)));
            }, true, "assign");
            Kit.Place((RectTransform)go.transform, new Vector2(1, 0), new Vector2(300, 112), new Vector2(-70, 60));
        }

        // ---- settings -------------------------------------------------------------------------

        private static void SettingsTab()
        {
            Title("Settings", null);
            var host = Kit.Rect("List", _content);
            host.anchorMin = Vector2.zero;
            host.anchorMax = Vector2.one;
            host.offsetMin = Vector2.zero;
            host.offsetMax = new Vector2(0, -380);
            var list = Kit.ScrollList(host, 20, out var scroll);
            Kit.Fill((RectTransform)scroll.transform);

            Section(list, "Account", Session.FullName + "\n<size=85%><color=#6B6B6B>" + RoleLabel() + "</color></size>",
                "Sign Out", App.SignOut);
            Section(list, "Server", Session.Server, "Change", AuthScreens.ServerScreen);
            Toggle(list, "Voiceover", "Narration in activities.", () => !Settings.Muted, v => Settings.Muted = !v);
            Volume(list);
            Toggle(list, "Captions", "Show the narration as text.", () => Settings.Captions, v => Settings.Captions = v);
            Toggle(list, "Interface sounds", "A soft click on every button.", () => Settings.UiSounds, v => Settings.UiSounds = v);
            Toggle(list, "Surface guides", "Show found surfaces while setting up.", () => Settings.SurfaceGuides, v => Settings.SurfaceGuides = v);
            var mb = Catalog.InstalledBytes() / 1048576f;
            Section(list, "Downloads", $"{mb:0.0} MB of activities on this device.", "Remove All", () =>
                Ui.Confirm("Remove All Downloads?", "Activities will need to be downloaded again. Your scores are kept.", "Remove", "Cancel", () =>
                {
                    foreach (var a in Catalog.Activities.ToList()) Catalog.Uninstall(a);
                    Show(Tab.Settings);
                }));
        }

        private static Image Row(Transform list, float height = 150)
        {
            var row = Kit.Card(list, "Setting", Theme.CardSolid, 36);
            Kit.Size(row, -1, height);
            return row;
        }

        private static void Section(Transform list, string title, string body, string button, Action click)
        {
            var row = Row(list, 190);
            var t = Kit.Text(row.transform, $"<b>{title}</b>\n<size=85%>{body}</size>", 40, Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Fill(t.rectTransform);
            t.rectTransform.offsetMin = new Vector2(50, 10);
            t.rectTransform.offsetMax = new Vector2(-460, -10);
            if (button == null) return;
            var b = Kit.Wide(row.transform, button, () => click(), false, null, 110);
            Kit.Place((RectTransform)b.transform, new Vector2(1, 0.5f), new Vector2(380, 110), new Vector2(-40, 0));
        }

        private static void Toggle(Transform list, string title, string body, Func<bool> get, Action<bool> set)
        {
            var row = Row(list);
            var t = Kit.Text(row.transform, "", 40, Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Fill(t.rectTransform);
            t.rectTransform.offsetMin = new Vector2(50, 0);
            t.rectTransform.offsetMax = new Vector2(-50, 0);
            void Draw() => t.text = $"<b>{title}</b>  <size=80%><color=#6B6B6B>{body}</color></size><pos=86%><b><color=#{(get() ? "138A2B" : "9E9E9E")}>{(get() ? "On" : "Off")}</color></b>";
            Draw();
            Kit.Clickable(row.gameObject, () => { set(!get()); Draw(); });
        }

        private static void Volume(Transform list)
        {
            var row = Row(list);
            var t = Kit.Text(row.transform, "<b>Voiceover volume</b>", 40, Theme.Medium, Theme.Ink, TextAlignmentOptions.MidlineLeft);
            Kit.Fill(t.rectTransform);
            t.rectTransform.offsetMin = new Vector2(50, 0);
            var steps = Kit.Rect("Steps", row.transform);
            Kit.Place(steps, new Vector2(1, 0.5f), new Vector2(700, 90), new Vector2(-50, 0));
            Kit.Row(steps, 12, null, TextAnchor.MiddleRight);
            var bars = new List<Image>();
            for (var i = 1; i <= 5; i++)
            {
                var level = i / 5f;
                var bar = Kit.Card(steps, "Level", Settings.VoiceoverVolume >= level - 0.01f ? Theme.Brand : Theme.Hex(0xDDDDDD), 14);
                Kit.Size(bar, 110, 40 + i * 10);
                bars.Add(bar);
                Kit.Clickable(bar.gameObject, () =>
                {
                    Settings.VoiceoverVolume = level;
                    for (var k = 0; k < bars.Count; k++) bars[k].color = level >= (k + 1) / 5f - 0.01f ? Theme.Brand : Theme.Hex(0xDDDDDD);
                });
            }
        }
    }
}
