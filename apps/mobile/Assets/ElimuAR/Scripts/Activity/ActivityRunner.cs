using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ElimuAR
{
    // One activity, start to finish: Setup (find a surface, Anchor, Done or Reset), then the authored
    // sections in order.
    public class ActivityRunner : MonoBehaviour
    {
        private enum Phase { None, Searching, SetupUnlocked, SetupLocked, Step, Question, Score }

        private class RunItem
        {
            public string Kind;            // observe, explore, question, summary
            public ManifestStep Step;
            public int Index, Total;       // per-phase counter (explore n of N, question n of N)
        }

        private class Answered
        {
            public List<int> Order;        // shuffled answer order
            public int Picked = -1;
            public bool Submitted;
        }

        public bool InActivity => _info != null;

        private ActivityInfo _info;
        private ActivityScene _scene;
        private ActivityHud _hud;
        private Interaction _interaction;
        private AudioSource _voice;
        private Phase _phase;
        private List<RunItem> _run = new List<RunItem>();
        private int _at;
        private readonly Dictionary<int, Answered> _answers = new Dictionary<int, Answered>();
        private ActivityHud.QuestionView _question;
        private RectTransform _scorePaper;
        private Coroutine _narration;
        private float _startedAt;
        private string _runId;

        // Assignment mode: a clock to the due time (or time limit); once the
        // questions begin there is no going back, and leaving hands the work in.
        private AssignmentRun _assignment;
        private DateTime? _assignmentStart;
        private bool _locked;
        private string _endReason;
        private bool _finished;
        private Texture2D _thumb;

        private Stage Stage => App.Instance.Stage;
        private ArRig Rig => App.Instance.Rig;
        private UiRoot Ui => UiRoot.Instance;

        private void Awake()
        {
            _voice = gameObject.AddComponent<AudioSource>();
            _voice.playOnAwake = false;
            _interaction = gameObject.AddComponent<Interaction>();
            _interaction.Held += OnHeld;
            _interaction.Released += OnReleased;
            _interaction.Snapped += OnSnapped;
            _interaction.Misfit += (part, slot) => Ui.Toast(part.Name + " does not fit there. Check its shape against the slot or the port.");
        }

        // ---- open / close -------------------------------------------------------------

        public void Open(ActivityInfo info, AssignmentRun assignment = null) => StartCoroutine(OpenRoutine(info, assignment));

        private IEnumerator OpenRoutine(ActivityInfo info, AssignmentRun assignment)
        {
            var busy = Ui.Loading();
            var manifest = Catalog.LoadManifest(info.activityKey);
            var path = Catalog.BundlePath(info);
            if (manifest == null || path == null)
            {
                Destroy(busy.gameObject);
                Ui.Notice("Activity not installed", "Download this activity from its page in the library first.");
                yield break;
            }
            _info = info;
            _finished = false;
            _assignment = assignment;
            _assignmentStart = null;
            _locked = false;
            _endReason = null;
            yield return Catalog.Thumbnail(info, t => _thumb = t);

            Ui.ClearScreens();
            Ui.ShowPaper(false);
            Rig.SetRunning(true);
            Stage.Clear();

            string error = null;
            yield return ActivityScene.Load(path, manifest, Stage.Content, s => _scene = s, e => error = e);
            Destroy(busy.gameObject);
            if (error != null)
            {
                Close();
                Ui.Notice("This activity could not open", error);
                yield break;
            }

            BuildRun();
            ShowObjects(_run.FirstOrDefault()?.Step);
            _scene.Remeasure();
            Stage.Configure(_scene.Footprint, _scene.BaseScale, manifest.settings.showDesk);
            _interaction.Configure(_scene, Stage);
            _interaction.PartsEnabled = false;
            _interaction.ToolsEnabled = false;
            _interaction.Mode = Tool.Parts;

            _hud = new ActivityHud(Ui.Hud);
            _hud.MorePressed += OpenMore;
            _hud.HelpPressed += () => _hud.Help(_phase == Phase.SetupUnlocked || _phase == Phase.SetupLocked || _phase == Phase.Searching);
            _hud.ToolsPressed += ToggleTray;
            _hud.HidePressed += () => _hud.ToggleCard();
            _hud.BackPressed += GoBack;
            _hud.PrimaryPressed += OnPrimary;
            _hud.SecondaryPressed += OnSecondary;

            if (!Rig.ArAvailable)
            {
                Ui.Notice("AR is not available", "This device cannot run augmented reality, so the activity is shown on screen instead.");
                StartWithoutAr();
            }
            else
            {
                BeginSetup();
            }
        }

        /// <summary>No ARCore: the activity sits in front of a plain backdrop.</summary>
        private void StartWithoutAr()
        {
            Rig.SetRunning(false);
            Ui.ShowPaper(true);
            Stage.PlaceInFront(Rig.Camera.transform);
            StartRun();
        }

        public void RequestExit()
        {
            if (_phase == Phase.Score) { Close(); return; }
            if (_assignment != null && _locked && !_finished)
            {
                Ui.Confirm("Hand In and Exit?",
                    "Leaving now hands in your work and uses this attempt. Questions you have not answered are marked wrong.",
                    "Hand In", "Keep Working", () =>
                    {
                        if (_finished || _info == null) return;
                        _finished = true;
                        var title = _info.title;
                        if (Session.IsStudent) HandIn("exited");
                        Close();
                        Ui.Toast(title + " handed in.");
                    });
                return;
            }
            if (_assignment != null)
            {
                Ui.Confirm("Exit Assignment?",
                    "Nothing is handed in until the questions begin, so you can start again before it is due.",
                    "Exit", "Cancel", Close);
                return;
            }
            Ui.Confirm("Exit Activity?", "Your progress in this run will not be saved.", "Exit", "Cancel", Close);
        }

        private void Close()
        {
            StopNarration();
            if (_info != null && !_finished && _answers.Count > 0 && _assignment == null)
            {
                var shown = _answers.Count(a => a.Value.Submitted);
                var correct = CountCorrect();
                if (shown > 0) Scores.Record(_info.activityKey, _runId, "in_progress", shown, correct, Seconds());
            }
            _interaction.PartsEnabled = false;
            _interaction.ToolsEnabled = false;
            _interaction.ClearStrokes();
            _scene?.Unload();
            _scene = null;
            Stage.Clear();
            Rig.SetRunning(false);
            _hud?.ClosePanel();
            _hud?.Destroy();
            _hud = null;
            _info = null;
            _assignment = null;
            _locked = false;
            _phase = Phase.None;
            Ui.ShowPaper(true);
            StartCoroutine(Scores.Flush());
            Home.Show();
        }

        // ---- setup ----------------------------------------------------------------------

        private void BeginSetup()
        {
            _phase = Phase.Searching;
            Stage.BeginSearch();
            _hud.SecondTile(false);
            _hud.ShowCorners(true, true, true, true);
            _hud.HideCard();
            _hud.Searching(true);
            _hud.Caption("");
            _hud.Secondary(null, null);
            _hud.Primary("anchor", "Anchor", false);
        }

        private void Update()
        {
            if (_hud == null) return;
            if (_phase == Phase.Searching || _phase == Phase.SetupUnlocked)
            {
                var found = Stage.SurfaceInView;
                if (_phase == Phase.Searching && (found || Rig.Planes.trackables.count > 0))
                {
                    _phase = Phase.SetupUnlocked;
                    _hud.Searching(false);
                    _hud.Card(null, "Setup",
                        "Aim your camera at a flat open surface and select Anchor to set your activity space.", 1, 2);
                }
                _hud.PrimaryEnabled(found);
            }
            _voice.volume = Settings.EffectiveVoiceVolume;
        }

        private void Anchor()
        {
            if (!Stage.AnchorHere()) return;
            _phase = Phase.SetupLocked;
            Stage.EndSearch();
            _hud.Card(null, "Setup", "Select Done to continue with this setting or Reset to adjust once more.", 2, 2);
            _hud.Secondary("reset", "Reset");
            _hud.Primary("done", "Done");
        }

        private void ResetSetup()
        {
            Stage.ResetAnchor();
            _phase = Phase.SetupUnlocked;
            _hud.Card(null, "Setup", "Aim your camera at a flat open surface and select Anchor to set your activity space.", 1, 2);
            _hud.Secondary(null, null);
            _hud.Primary("anchor", "Anchor", false);
        }

        private void Done()
        {
            Stage.EndSearch();
            Rig.SetGuides(false);
            StartRun();
        }

        // ---- the run ----------------------------------------------------------------------

        private void BuildRun()
        {
            _run = new List<RunItem>();
            var random = new System.Random();
            var explore = _scene.Manifest.sections.Where(s => s.kind == "explore").SelectMany(s => s.steps).Count();
            var e = 0;
            foreach (var section in _scene.Manifest.sections)
            {
                var steps = section.steps.ToList();
                if (section.randomize) steps = steps.OrderBy(_ => random.Next()).ToList();
                if (section.maxSteps > 0 && steps.Count > section.maxSteps) steps = steps.Take(section.maxSteps).ToList();
                var q = 0;
                foreach (var step in steps)
                {
                    var kind = step.IsQuestion ? "question" : section.kind;
                    var item = new RunItem { Kind = kind, Step = step };
                    if (kind == "explore") { item.Index = ++e; item.Total = explore; }
                    if (kind == "question") { item.Index = ++q; item.Total = steps.Count; }
                    _run.Add(item);
                }
            }
        }

        private void StartRun()
        {
            _answers.Clear();
            _startedAt = Time.realtimeSinceStartup;
            _runId = Guid.NewGuid().ToString("N");
            _finished = false;
            if (_assignment != null && _assignmentStart == null)
            {
                _assignmentStart = DateTime.UtcNow;
                StartCoroutine(Clock());
            }
            if (Session.IsStudent)
            {
                Scores.Record(_info.activityKey, _runId, "in_progress", 0, 0, 0);
                StartCoroutine(Scores.Flush());
            }
            Show(0);
        }

        private int Seconds() => Mathf.RoundToInt(Time.realtimeSinceStartup - _startedAt);

        private void Show(int index)
        {
            StopNarration();
            CloseQuestion();
            _hud.CloseTray();
            _hud.ClosePanel();
            _at = Mathf.Clamp(index, 0, _run.Count);
            if (_at >= _run.Count) { ShowScore(); return; }
            var item = _run[_at];
            if (item.Kind == "question") { ShowQuestion(item); return; }

            _phase = Phase.Step;
            Ui.ShowPaper(!Rig.ArAvailable);
            Stage.Space.gameObject.SetActive(true);
            ShowObjects(item.Step);
            _hud.SetHidden(false);
            _hud.ShowCorners(true, true, true, !_locked);
            _hud.SecondTile(true);
            var step = item.Step;
            var counter = item.Kind == "explore" && item.Total > 1;
            _hud.Card(_info.title, step.title, step.description, counter ? item.Index : 0, counter ? item.Total : 0);
            _hud.Caption("");

            switch (item.Kind)
            {
                case "observe":
                    _interaction.PartsEnabled = false;
                    _interaction.ToolsEnabled = true;
                    _hud.Secondary("replay", Button(step, "observe_replay", "Replay"));
                    _hud.Primary("next", "Next");
                    PlayIntro(step);
                    break;
                case "explore":
                    _interaction.PartsEnabled = true;
                    _interaction.ToolsEnabled = true;
                    _hud.Secondary("reset", Button(step, "explore_reset", "Reset"));
                    _hud.Primary("next", "Next");
                    if (step.voClip != null && step.autoplayVO) _narration = StartCoroutine(Narrate(step));
                    break;
                default: // summary
                    _interaction.PartsEnabled = false;
                    _interaction.ToolsEnabled = true;
                    _hud.Secondary(null, null);
                    _hud.Primary("done", "Finish");
                    if (step.voClip != null && step.autoplayVO) _narration = StartCoroutine(Narrate(step));
                    break;
            }
        }

        private static string Button(ManifestStep step, string id, string fallback)
        {
            var b = step.buttons?.FirstOrDefault(x => x.id == id);
            return b != null && !string.IsNullOrEmpty(b.text) ? b.text : fallback;
        }

        /// <summary>Turns on exactly the step roots this step names (and off every other one).</summary>
        private void ShowObjects(ManifestStep step)
        {
            if (_scene == null) return;
            var all = _scene.Manifest.sections.SelectMany(s => s.steps).SelectMany(s => s.objectPaths ?? new List<string>()).Distinct();
            var wanted = new HashSet<string>(step?.objectPaths ?? new List<string>());
            foreach (var path in all)
            {
                var t = _scene.Find(path);
                if (t == null) continue;
                var on = wanted.Contains(path);
                if (t.gameObject.activeSelf != on) t.gameObject.SetActive(on);
            }
            _scene.Ground();
        }

        // ---- observe: the animation and its narration -------------------------------------

        private void PlayIntro(ManifestStep step)
        {
            var introPath = _scene.Manifest.intro?.path ?? _scene.Manifest.animator?.path;
            var intro = _scene.Find(introPath);
            if (intro != null)
            {
                foreach (var animator in intro.GetComponentsInChildren<Animator>(true))
                {
                    animator.Rebind();
                    animator.Update(0f);
                    var start = _scene.Manifest.animator?.startState;
                    if (!string.IsNullOrEmpty(start)) animator.Play(start, 0, 0f);
                }
                foreach (var legacy in intro.GetComponentsInChildren<Animation>(true))
                {
                    legacy.Stop();
                    legacy.Play();
                }
            }
            _narration = StartCoroutine(Narrate(step));
        }

        /// <summary>The step's narration with its timed captions; a -1 duration holds until Next.</summary>
        private IEnumerator Narrate(ManifestStep step)
        {
            var clip = _scene.Clip(step.voClip);
            if (clip != null && step.autoplayVO)
            {
                _voice.clip = clip;
                _voice.volume = Settings.EffectiveVoiceVolume;
                _voice.Play();
            }
            foreach (var caption in step.captions ?? new List<Caption>())
            {
                _hud.Caption(caption.text);
                if (caption.duration < 0) yield break;
                yield return new WaitForSeconds(Mathf.Max(0.5f, caption.duration));
            }
            if (clip != null) while (_voice.isPlaying) yield return null;
            _hud.Caption("");
        }

        private void StopNarration()
        {
            if (_narration != null) StopCoroutine(_narration);
            _narration = null;
            if (_voice != null) _voice.Stop();
            _hud?.Caption("");
        }

        // ---- explore: holding and placing parts ----------------------------------------------

        private string _stepCaption;

        private void OnHeld(Interaction.Part part)
        {
            if (_phase != Phase.Step) return;
            if (!string.IsNullOrEmpty(part.Item.holdCaption)) _hud.Caption(part.Item.holdCaption);
            var clip = _scene.Clip(part.Item.holdClip);
            if (clip != null)
            {
                if (_narration != null) StopCoroutine(_narration);
                _voice.clip = clip;
                _voice.volume = Settings.EffectiveVoiceVolume;
                _voice.Play();
            }
        }

        private void OnReleased()
        {
            if (_phase != Phase.Step) return;
            StartCoroutine(ClearCaptionSoon());
        }

        private IEnumerator ClearCaptionSoon()
        {
            yield return new WaitForSeconds(1.2f);
            if (_hud != null && !_voice.isPlaying) _hud.Caption(_stepCaption ?? "");
        }

        private void OnSnapped(Interaction.Part part)
        {
            if (_phase != Phase.Step || _at >= _run.Count) return;
            var item = _run[_at];
            if (item.Kind != "explore") return;
            // A part with a transition opens the next stage of this explore (zooming in).
            if (part.HasTransition && _at + 1 < _run.Count && _run[_at + 1].Kind == "explore")
            {
                StartCoroutine(AdvanceAfter(0.9f));
                return;
            }
            if (_interaction.ActiveCount() > 0 && _interaction.ActiveSnapped() >= _interaction.ActiveCount())
                MoveOn(item.Step);
        }

        private IEnumerator AdvanceAfter(float seconds)
        {
            yield return new WaitForSeconds(seconds);
            if (_phase == Phase.Step) Show(_at + 1);
        }

        // ---- buttons ---------------------------------------------------------------------------

        private void OnPrimary()
        {
            switch (_phase)
            {
                case Phase.SetupUnlocked: Anchor(); break;
                case Phase.SetupLocked: Done(); break;
                case Phase.Step:
                    var item = _run[_at];
                    if (item.Kind == "summary") Show(_at + 1);
                    else MoveOn(item.Step);
                    break;
            }
        }

        private void OnSecondary()
        {
            switch (_phase)
            {
                case Phase.SetupLocked: ResetSetup(); break;
                case Phase.Step:
                    var item = _run[_at];
                    if (item.Kind == "observe") { StopNarration(); PlayIntro(item.Step); }
                    else if (item.Kind == "explore") _interaction.ResetParts();
                    break;
            }
        }

        /// <summary>The authored move-on: a confirmation, then the countdown, then the next step.</summary>
        private void MoveOn(ManifestStep step)
        {
            if (!step.confirmMoveOn)
            {
                Show(_at + 1);
                return;
            }
            var c = step.confirm;
            Ui.Confirm(string.IsNullOrEmpty(c.title) ? "Ready to Move On?" : c.title, c.content,
                string.IsNullOrEmpty(c.confirm) ? "Continue" : c.confirm,
                string.IsNullOrEmpty(c.cancel) ? "Cancel" : c.cancel,
                () => StartCoroutine(CountdownThen(step)));
        }

        private IEnumerator CountdownThen(ManifestStep step)
        {
            StopNarration();
            yield return Ui.Countdown(step.countdown?.text, step.countdown?.duration ?? 5f);
            Show(_at + 1);
        }

        private void GoBack()
        {
            if (_locked) return;
            switch (_phase)
            {
                case Phase.Searching:
                case Phase.SetupUnlocked:
                    RequestExit();
                    break;
                case Phase.SetupLocked:
                    ResetSetup();
                    break;
                case Phase.Step:
                    if (_at == 0)
                    {
                        StopNarration();
                        _interaction.PartsEnabled = false;
                        ResetSetup();
                    }
                    else Show(_at - 1);
                    break;
            }
        }

        // ---- more / tools ---------------------------------------------------------------------

        private void OpenMore()
        {
            _hud.CloseTray();
            var arAvailable = _phase != Phase.Question && _phase != Phase.Score && Rig.ArAvailable;
            _hud.MoreOptions(RequestExit, _locked ? (Action)null : Restart, () => _hud.ArSettings(ApplySettings), arAvailable);
        }

        private void ApplySettings()
        {
            var setup = _phase == Phase.Searching || _phase == Phase.SetupUnlocked || _phase == Phase.SetupLocked;
            Rig.SetGuides(setup);
            _voice.volume = Settings.EffectiveVoiceVolume;
            if (!Settings.Captions) _hud.Caption("");
        }

        private void Restart()
        {
            _interaction.ResetParts();
            _interaction.ClearStrokes();
            CloseQuestion();
            if (_scorePaper != null) Destroy(_scorePaper.gameObject);
            BuildRun();
            if (Stage.Anchored) StartRun();
            else BeginSetup();
        }

        private void ToggleTray()
        {
            if (_hud.TrayOpen) { _hud.CloseTray(); return; }
            _hud.OpenTray(_interaction.Mode, tool =>
            {
                _interaction.Mode = tool;
                _hud.MarkTool(tool);
                _hud.CloseTray();
                Ui.Toast(ToolHint(tool));
            }, () =>
            {
                _interaction.ClearStrokes();
                _hud.CloseTray();
                Ui.Toast("Drawing cleared.");
            }, () => StartCoroutine(Photo()));
        }

        private static string ToolHint(Tool tool)
        {
            switch (tool)
            {
                case Tool.Parts: return "Touch and drag parts to take them apart.";
                case Tool.All: return "Drag outside the parts to move everything.";
                case Tool.Rotate: return "Drag outside the parts to rotate.";
                case Tool.Scale: return "Pinch, or drag up and down, to change the size.";
                case Tool.Draw: return "Drag your finger to draw.";
                default: return "Touch a drawing to erase it.";
            }
        }

        private IEnumerator Photo()
        {
            _hud.CloseTray();
            var hidden = _hud.Hidden;
            UiRoot.Instance.gameObject.GetComponent<Canvas>().enabled = false;
            yield return new WaitForEndOfFrame();
            var tex = ScreenCapture.CaptureScreenshotAsTexture();
            UiRoot.Instance.gameObject.GetComponent<Canvas>().enabled = true;
            var png = tex.EncodeToPNG();
            Destroy(tex);
            var ok = Gallery.Save(png, "ElimuAR-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + ".png");
            Ui.Toast(ok ? "Photo saved to your gallery." : "The photo could not be saved.");
            _hud.SetHidden(hidden);
        }

        // ---- questions --------------------------------------------------------------------------

        private void ShowQuestion(RunItem item)
        {
            _phase = Phase.Question;
            if (_assignment != null && !_locked)
            {
                _locked = true;
                KeepDraft();
            }
            _interaction.PartsEnabled = false;
            _interaction.ToolsEnabled = false;
            _hud.SetHidden(true);
            _hud.CloseTray();
            Ui.ShowPaper(true);
            Stage.Space.gameObject.SetActive(false);

            var q = item.Step.question;
            if (!_answers.TryGetValue(_at, out var state))
            {
                var order = Enumerable.Range(0, q.answers.Count).ToList();
                if (q.randomizeAnswers) { var r = new System.Random(); order = order.OrderBy(_ => r.Next()).ToList(); }
                state = new Answered { Order = order };
                _answers[_at] = state;
            }
            var texts = state.Order.Select(i => q.answers[i].text).ToList();
            var at = _at;
            _question = _hud.Question(_info.title, item.Index, item.Total, item.Step.description, texts,
                pick =>
                {
                    if (state.Submitted) return;
                    state.Picked = pick;
                    ActivityHud.MarkPicked(_question, pick);
                },
                () =>
                {
                    if (at == 0 || _run[at - 1].Kind != "question") GoBackFromQuestions(at);
                    else Show(at - 1);
                },
                () =>
                {
                    if (!state.Submitted)
                    {
                        if (state.Picked < 0) return;
                        state.Submitted = true;
                        Reveal(item, state);
                        KeepDraft();
                    }
                    else Show(IsLastQuestion(at) ? _run.Count : at + 1);
                },
                OpenMore);
            Kit.SetEnabled(_question.Back, !_locked);
            _question.Back.gameObject.SetActive(!_locked);
            if (state.Submitted) Reveal(item, state);
            else if (state.Picked >= 0) ActivityHud.MarkPicked(_question, state.Picked);
        }

        private void GoBackFromQuestions(int at)
        {
            Ui.ShowPaper(!Rig.ArAvailable);
            Show(at - 1);
        }

        private void Reveal(RunItem item, Answered state)
        {
            var q = item.Step.question;
            var correct = state.Order.FindIndex(i => q.answers[i].correct);
            var right = state.Picked == correct;
            var letter = correct >= 0 ? ((char)('A' + correct)).ToString() : "?";
            var header = (right ? q.correctHeader : q.incorrectHeader) ?? "";
            if (string.IsNullOrEmpty(header)) header = right ? "<b>Great job, ::ANSWER:: is correct!</b>" : "<b>The correct answer is ::ANSWER::.</b>";
            var banner = header.Replace("::ANSWER::", letter);
            var feedback = right ? q.correctFeedback : q.incorrectFeedback;
            var answerFeedback = state.Picked >= 0 ? q.answers[state.Order[state.Picked]].feedback : null;
            var extra = !string.IsNullOrEmpty(answerFeedback) ? answerFeedback : feedback;
            if (!string.IsNullOrEmpty(extra)) banner += "\n<size=80%>" + extra + "</size>";
            ActivityHud.Reveal(_question, state.Picked, correct, banner, right);
            if (IsLastQuestion(_run.IndexOf(item))) Kit.SetTile(_question.Action, "done", "Finish");
            else Kit.SetTile(_question.Action, "next", "Next");
            Kit.SetEnabled(_question.Action, true);
        }

        private bool IsLastQuestion(int at) => !_run.Skip(at + 1).Any(r => r.Kind == "question");

        private void CloseQuestion()
        {
            if (_question?.Root != null) Destroy(_question.Root.gameObject);
            _question = null;
        }

        private int CountCorrect()
        {
            var n = 0;
            foreach (var pair in _answers)
            {
                if (!pair.Value.Submitted) continue;
                var q = _run[pair.Key].Step.question;
                var correct = pair.Value.Order.FindIndex(i => q.answers[i].correct);
                if (pair.Value.Picked == correct) n++;
            }
            return n;
        }

        // ---- score ----------------------------------------------------------------------------------

        private void ShowScore()
        {
            _phase = Phase.Score;
            StopNarration();
            _interaction.PartsEnabled = false;
            _interaction.ToolsEnabled = false;
            _hud.SetHidden(true);
            Ui.ShowPaper(true);
            Stage.Space.gameObject.SetActive(false);

            var shown = _run.Count(r => r.Kind == "question");
            var correct = CountCorrect();
            if (!_finished)
            {
                _finished = true;
                if (_assignment != null && Session.IsStudent) HandIn(_endReason ?? "finished");
                else if (Session.IsStudent && shown > 0)
                {
                    Scores.Record(_info.activityKey, _runId, correct == shown ? "mastered" : "completed", shown, correct, Seconds());
                    StartCoroutine(Scores.Flush());
                }
            }
            _hud.Timer(null, false);
            if (_scorePaper != null) Destroy(_scorePaper.gameObject);
            if (_assignment != null)
            {
                var percent = shown > 0 ? Mathf.RoundToInt(100f * correct / shown) : 0;
                _scorePaper = _hud.ScorePaper(_info, _info.title, percent, _thumb, Close, null, "Handed In · Your Score");
                return;
            }
            var best = Session.IsStudent ? Scores.Best(_info.activityKey) : (shown > 0 ? Mathf.RoundToInt(100f * correct / shown) : -1);
            _scorePaper = _hud.ScorePaper(_info, _info.title, best, _thumb, Close, PlayAgain);
        }

        // ---- assignment mode -------------------------------------------------------------------

        /// <summary>The clock to the due time or time limit; when it runs out the work is handed in.</summary>
        private IEnumerator Clock()
        {
            var deadline = _assignment.Deadline(_assignmentStart.Value);
            while (_info != null && _assignment != null && !_finished)
            {
                if (_hud != null)
                {
                    if (!deadline.HasValue) _hud.Timer("Assignment", false);
                    else
                    {
                        var left = deadline.Value - DateTime.UtcNow;
                        if (left <= TimeSpan.Zero) { TimeUp(); yield break; }
                        _hud.Timer(Remaining(left, deadline.Value), left.TotalSeconds <= 60);
                    }
                }
                yield return new WaitForSecondsRealtime(0.5f);
            }
        }

        private static string Remaining(TimeSpan left, DateTime deadline)
        {
            if (left.TotalHours >= 24) return "Due " + deadline.ToLocalTime().ToString("ddd d MMM, HH:mm", System.Globalization.CultureInfo.InvariantCulture);
            if (left.TotalHours >= 1) return $"{(int)left.TotalHours}:{left.Minutes:00}:{left.Seconds:00} left";
            return $"{left.Minutes}:{left.Seconds:00} left";
        }

        private void TimeUp()
        {
            if (_finished) return;
            _endReason = "time_up";
            Show(_run.Count);
            Ui.Notice("Time is up", "Your work has been handed in. Questions you had not answered are marked wrong.");
        }

        /// <summary>Hands the attempt in: unanswered questions count as wrong.</summary>
        private void HandIn(string reason)
        {
            Scores.Submit(_assignment.Id, _info.activityKey, Handin(reason));
            StartCoroutine(Scores.Flush());
        }

        /// <summary>Keeps the attempt as it stands, to hand in if the app is closed part-way.</summary>
        private void KeepDraft()
        {
            if (_assignment == null || !Session.IsStudent || _finished) return;
            Scores.SaveDraft(_assignment.Id, _info.activityKey, Handin("app_closed"));
        }

        private Newtonsoft.Json.Linq.JObject Handin(string reason)
        {
            var items = new Newtonsoft.Json.Linq.JArray();
            int shown = 0, correct = 0;
            for (var i = 0; i < _run.Count; i++)
            {
                if (_run[i].Kind != "question") continue;
                var q = _run[i].Step.question;
                var right = q.answers.FindIndex(a => a.correct);
                var chosen = _answers.TryGetValue(i, out var state) && state.Submitted && state.Picked >= 0 ? state.Order[state.Picked] : -1;
                var ok = chosen >= 0 && chosen == right;
                shown++;
                if (ok) correct++;
                items.Add(new Newtonsoft.Json.Linq.JObject
                {
                    ["prompt"] = Clip(_run[i].Step.description, 2000),
                    ["chosen"] = chosen >= 0 ? (Newtonsoft.Json.Linq.JToken)Clip(q.answers[chosen].text, 1000) : Newtonsoft.Json.Linq.JValue.CreateNull(),
                    ["answer"] = right >= 0 ? (Newtonsoft.Json.Linq.JToken)Clip(q.answers[right].text, 1000) : Newtonsoft.Json.Linq.JValue.CreateNull(),
                    ["correct"] = ok,
                });
            }
            string Iso(DateTime d) => d.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", System.Globalization.CultureInfo.InvariantCulture);
            return new Newtonsoft.Json.Linq.JObject
            {
                ["runId"] = _runId,
                ["reportId"] = Guid.NewGuid().ToString("N"),
                ["startedAt"] = Iso(_assignmentStart ?? DateTime.UtcNow),
                ["playedAt"] = Iso(DateTime.UtcNow),
                ["questionsShown"] = shown,
                ["questionsCorrect"] = correct,
                ["durationSeconds"] = Mathf.Clamp((int)(DateTime.UtcNow - (_assignmentStart ?? DateTime.UtcNow)).TotalSeconds, 0, 86400),
                ["reason"] = reason,
                ["items"] = items,
            };
        }

        private static string Clip(string text, int max)
        {
            text = System.Text.RegularExpressions.Regex.Replace(text ?? "", "<[^>]+>", "").Trim();
            return text.Length <= max ? text : text.Substring(0, max);
        }

        private void PlayAgain()
        {
            if (_scorePaper != null) Destroy(_scorePaper.gameObject);
            _scorePaper = null;
            _interaction.ResetParts();
            _interaction.ClearStrokes();
            BuildRun();
            _hud.SetHidden(false);
            if (Rig.ArAvailable && Stage.Anchored) { Ui.ShowPaper(false); StartRun(); }
            else if (Rig.ArAvailable) BeginSetup();
            else StartRun();
        }

#if UNITY_EDITOR
        // ---- screen tour hooks (editor only) ---------------------------------------------------

        public bool TourReady => _hud != null && _scene != null;

        public void TourSetup(bool locked, bool searching)
        {
            StopNarration();
            CloseQuestion();
            if (_scorePaper != null) Destroy(_scorePaper.gameObject);
            Ui.ShowPaper(false);
            _hud.SetHidden(false);
            _hud.SecondTile(false);
            _hud.ShowCorners(true, true, true, true);
            Stage.Space.gameObject.SetActive(locked);
            if (searching)
            {
                _phase = Phase.Searching;
                _hud.HideCard();
                _hud.Searching(true);
                _hud.Secondary(null, null);
                _hud.Primary("anchor", "Anchor", false);
                return;
            }
            _hud.Searching(false);
            _phase = locked ? Phase.SetupLocked : Phase.SetupUnlocked;
            if (locked)
            {
                _hud.Card(null, "Setup", "Select Done to continue with this setting or Reset to adjust once more.", 2, 2);
                _hud.Secondary("reset", "Reset");
                _hud.Primary("done", "Done");
            }
            else
            {
                _hud.Card(null, "Setup", "Aim your camera at a flat open surface and select Anchor to set your activity space.", 1, 2);
                _hud.Secondary(null, null);
                _hud.Primary("anchor", "Anchor", true);
            }
        }

        public void TourStep(int index)
        {
            if (_scorePaper != null) Destroy(_scorePaper.gameObject);
            _hud.Searching(false);
            Show(index);
        }

        public int TourIndexOf(string kind) => _run.FindIndex(r => r.Kind == kind);

        public void TourAnswer(bool correct)
        {
            if (_phase != Phase.Question || !_answers.TryGetValue(_at, out var state)) return;
            var q = _run[_at].Step.question;
            var right = state.Order.FindIndex(i => q.answers[i].correct);
            state.Picked = correct ? right : (right + 1) % state.Order.Count;
            state.Submitted = true;
            Reveal(_run[_at], state);
        }

        public void TourMore() => OpenMore();

        public void TourScore() => Show(_run.Count);

        public void TourClose()
        {
            _hud?.ClosePanel();
            Close();
        }
#endif
    }
}
