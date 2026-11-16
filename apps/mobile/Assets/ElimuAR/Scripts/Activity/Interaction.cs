using System;
using System.Collections;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.EventSystems;

namespace ElimuAR
{
    public enum Tool { Parts, All, Rotate, Scale, Draw, Erase }

    /// <summary>Every touch on the AR view.</summary>
    public class Interaction : MonoBehaviour
    {
        public class Part
        {
            public DragItem Item;
            public Transform Grab;        // the object the touch lands on
            public Transform Moved;       // the object that moves (dragTransform)
            public Transform Target;
            public Transform Tray;
            public string Name;
            public bool HasTransition;
            public bool Snapped;
            public Transform HomeParent;
            public Vector3 HomePosition;
            public Quaternion HomeRotation;
            public Vector3 HomeScale;
        }

        public Tool Mode = Tool.Parts;
        public bool PartsEnabled;
        public bool ToolsEnabled;
        public event Action<Part> Snapped;
        public event Action<Part, Part> Misfit;
        public event Action<Part> Held;
        public event Action Released;

        public readonly List<Part> Parts = new List<Part>();
        private Faders _faders;
        private readonly List<LineRenderer> _strokes = new List<LineRenderer>();
        private ActivityScene _scene;
        private Stage _stage;
        private Part _active;
        private Vector3 _grabOffset;
        private Plane _dragPlane;
        private Vector2 _touchStart;
        private bool _dragging;
        private LineRenderer _stroke;
        private Vector2 _lastSingle;
        private float _lastPinch, _lastTwist;
        private int _fingerId = -1;

        public void Configure(ActivityScene scene, Stage stage)
        {
            _scene = scene;
            _stage = stage;
            Parts.Clear();
            var science = new Dictionary<Transform, ScienceObjectInfo>();
            foreach (var s in scene.Manifest.scienceObjects)
            {
                var t = scene.Find(s.path);
                if (t != null) science[t] = s;
            }
            foreach (var item in scene.Manifest.dragItems)
            {
                if (!item.isDraggable) continue;
                var grab = scene.Find(item.path);
                var moved = scene.Find(item.dragPath) ?? grab;
                var target = scene.Find(item.targetPath);
                if (grab == null || moved == null || target == null) continue;
                science.TryGetValue(grab, out var info);
                if (info == null) science.TryGetValue(moved, out info);
                var part = new Part
                {
                    Item = item, Grab = grab, Moved = moved, Target = target,
                    Name = info?.name ?? grab.name, HasTransition = info?.hasTransitionAnimation ?? false,
                    Tray = info != null ? scene.Find(info.trayPath) : null,
                    HomeParent = moved.parent, HomePosition = moved.localPosition,
                    HomeRotation = moved.localRotation, HomeScale = moved.localScale,
                };
                EnsureCollider(grab);
                Parts.Add(part);
            }
            LabelTrays(scene);
            _faders = new Faders(scene, this);
            _faders.Ghost(null);
        }

        /// <summary>Ghosts the model once any part is out; the parts that are out stay solid.</summary>
        private void UpdateGhosts()
        {
            if (_faders == null || _faders.Count == 0) return;
            var out_ = new List<Transform>();
            foreach (var p in Parts)
                if (p.Snapped || p == _active && _dragging || p.Moved.localPosition != p.HomePosition) out_.Add(p.Moved);
            _faders.Ghost(out_.Count == 0 ? null : out_);
        }

        /// <summary>Each tray's pin shows the name of the part that belongs on it.</summary>
        private static void LabelTrays(ActivityScene scene)
        {
            var trayNames = new Dictionary<string, string>();
            foreach (var s in scene.Manifest.scienceObjects)
                if (!string.IsNullOrEmpty(s.trayPath)) trayNames[s.trayPath] = s.name;
            foreach (var tray in scene.Manifest.trays)
            {
                if (!trayNames.TryGetValue(tray.path, out var name)) continue;
                var label = scene.Find(tray.labelPath);
                var text = label != null ? label.GetComponent<TMP_Text>() : null;
                if (text == null)
                {
                    var t = scene.Find(tray.path);
                    text = t != null ? t.GetComponentInChildren<TMP_Text>(true) : null;
                }
                if (text != null) text.text = name;
            }
        }

        private static void EnsureCollider(Transform t)
        {
            if (t.GetComponentInChildren<Collider>(true) != null) return;
            var mf = t.GetComponentInChildren<MeshFilter>(true);
            if (mf == null || mf.sharedMesh == null) return;
            var box = mf.gameObject.AddComponent<BoxCollider>();
            box.center = mf.sharedMesh.bounds.center;
            box.size = mf.sharedMesh.bounds.size;
        }

        public int ActiveCount() => Parts.FindAll(p => p.Grab.gameObject.activeInHierarchy).Count;
        public int ActiveSnapped() => Parts.FindAll(p => p.Snapped && p.Grab.gameObject.activeInHierarchy).Count;

        public void ResetParts()
        {
            foreach (var p in Parts)
            {
                if (!p.Snapped && p.Moved.localPosition == p.HomePosition) continue;
                p.Snapped = false;
                StartCoroutine(TweenHome(p, 0.35f));
            }
        }

        public void ClearStrokes()
        {
            foreach (var s in _strokes) if (s != null) Destroy(s.gameObject);
            _strokes.Clear();
        }

        // ---- touches ----------------------------------------------------------

        private void Update()
        {
            if (_scene == null || _stage == null || !_stage.Anchored) return;
            var touches = Touches();
            if (touches.Count >= 2 && ToolsEnabled)
            {
                CancelSingle();
                TwoFinger(touches[0], touches[1]);
                return;
            }
            _lastPinch = 0;
            if (touches.Count == 1) OneFinger(touches[0]);
            else if (_fingerId >= 0) EndSingle();
        }

        private struct TouchPoint { public int id; public Vector2 pos; public TouchPhase phase; }

        private static List<TouchPoint> Touches()
        {
            var list = new List<TouchPoint>();
            for (var i = 0; i < Input.touchCount; i++)
            {
                var t = Input.GetTouch(i);
                list.Add(new TouchPoint { id = t.fingerId, pos = t.position, phase = t.phase });
            }
#if UNITY_EDITOR
            if (list.Count == 0 && (Input.GetMouseButton(0) || Input.GetMouseButtonUp(0)))
                list.Add(new TouchPoint
                {
                    id = 99, pos = Input.mousePosition,
                    phase = Input.GetMouseButtonDown(0) ? TouchPhase.Began : Input.GetMouseButtonUp(0) ? TouchPhase.Ended : TouchPhase.Moved,
                });
#endif
            return list;
        }

        private static bool OverUi(TouchPoint t)
        {
            var es = EventSystem.current;
            if (es == null) return false;
            var data = new PointerEventData(es) { position = t.pos };
            var results = new List<RaycastResult>();
            es.RaycastAll(data, results);
            return results.Count > 0;
        }

        private void OneFinger(TouchPoint t)
        {
            if (t.phase == TouchPhase.Began)
            {
                if (OverUi(t)) { _fingerId = -2; return; }
                _fingerId = t.id;
                _touchStart = t.pos;
                _lastSingle = t.pos;
                _dragging = false;
                _active = PartsEnabled && (Mode == Tool.Parts || Mode == Tool.All || Mode == Tool.Rotate || Mode == Tool.Scale)
                    ? PartUnder(t.pos) : null;
                if (_active != null) BeginHold(t.pos);
                else if (ToolsEnabled && Mode == Tool.Draw) BeginStroke(t.pos);
                else if (ToolsEnabled && Mode == Tool.Erase) EraseAt(t.pos);
                return;
            }
            if (_fingerId < 0 || t.id != _fingerId) return;
            if (t.phase == TouchPhase.Ended || t.phase == TouchPhase.Canceled)
            {
                EndSingle();
                return;
            }

            var delta = t.pos - _lastSingle;
            _lastSingle = t.pos;
            if (_active != null)
            {
                if (!_dragging && (t.pos - _touchStart).magnitude > Screen.dpi * 0.06f)
                {
                    _dragging = true;
                    UpdateGhosts();
                }
                if (_dragging) DragTo(t.pos);
                return;
            }
            if (!ToolsEnabled) return;
            switch (Mode)
            {
                case Tool.All:
                    MoveAll(t.pos, delta);
                    break;
                case Tool.Rotate:
                    _stage.RotateBy(-delta.x / Screen.width * 360f);
                    break;
                case Tool.Scale:
                    _stage.ScaleBy(1f + delta.y / Screen.height * 1.5f);
                    break;
                case Tool.Draw:
                    ExtendStroke(t.pos);
                    break;
                case Tool.Erase:
                    EraseAt(t.pos);
                    break;
            }
        }

        private void TwoFinger(TouchPoint a, TouchPoint b)
        {
            var distance = Vector2.Distance(a.pos, b.pos);
            var angle = Mathf.Atan2(b.pos.y - a.pos.y, b.pos.x - a.pos.x) * Mathf.Rad2Deg;
            if (_lastPinch > 0)
            {
                _stage.ScaleBy(distance / _lastPinch);
                _stage.RotateBy(-Mathf.DeltaAngle(_lastTwist, angle));
            }
            _lastPinch = distance;
            _lastTwist = angle;
        }

        private void CancelSingle()
        {
            if (_active != null && _dragging) Release();
            _active = null;
            _stroke = null;
            _fingerId = -1;
        }

        private void EndSingle()
        {
            if (_active != null) Release();
            _active = null;
            _stroke = null;
            _fingerId = -1;
        }

        // ---- parts --------------------------------------------------------------

        private Part PartUnder(Vector2 screen)
        {
            var ray = ArRig.Instance.Camera.ScreenPointToRay(screen);
            var hits = Physics.RaycastAll(ray, 20f, ~0, QueryTriggerInteraction.Collide);
            Array.Sort(hits, (x, y) => x.distance.CompareTo(y.distance));
            foreach (var hit in hits)
                foreach (var p in Parts)
                    if (p.Grab.gameObject.activeInHierarchy && hit.transform.IsChildOf(p.Grab)) return p;
            return null;
        }

        private void BeginHold(Vector2 screen)
        {
            var ray = ArRig.Instance.Camera.ScreenPointToRay(screen);
            var height = _active.Moved.position.y + 0.02f * _stage.Content.lossyScale.x;
            if (_active.Item.lift > 0) height = Mathf.Max(height, CarryHeight(_active));
            _dragPlane = new Plane(_stage.Space.up, new Vector3(0, height, 0) + Vector3.ProjectOnPlane(_stage.Space.position, Vector3.up));
            _grabOffset = _dragPlane.Raycast(ray, out var enter) ? _active.Moved.position - ray.GetPoint(enter) : Vector3.zero;
            Held?.Invoke(_active);
        }

        private void DragTo(Vector2 screen)
        {
            var ray = ArRig.Instance.Camera.ScreenPointToRay(screen);
            if (!_dragPlane.Raycast(ray, out var enter)) return;
            if (_active.Snapped) _active.Snapped = false;
            if (_active.Moved.parent != _active.HomeParent) _active.Moved.SetParent(_active.HomeParent, true);
            var lifted = ray.GetPoint(enter) + _grabOffset;
            _active.Moved.position = Vector3.Lerp(_active.Moved.position, lifted, _active.Item.lift > 0 ? 0.35f : 0.6f);
            if (_active.Item.lift > 0)
                _active.Moved.rotation = Quaternion.Slerp(_active.Moved.rotation, _active.Target.rotation, 0.12f);
            // Out of its tray, a part grows back to its own size as it is carried.
            _active.Moved.localScale = Vector3.Lerp(_active.Moved.localScale, _active.HomeScale, 0.25f);
        }

        private void Release()
        {
            var part = _active;
            Released?.Invoke();
            if (!_dragging)
            {
                // A tap: the part names itself (caption and
                // voice, already started on touch) and flies to its tray.
                if (!part.Snapped)
                {
                    part.Snapped = true;
                    UpdateGhosts();
                    StartCoroutine(TweenTo(part, Mathf.Max(0.45f, part.Item.targetTweenDuration)));
                }
                return;
            }
            var flat = Vector3.ProjectOnPlane(part.Moved.position - part.Target.position, _stage.Space.up);
            if (flat.magnitude <= Reach(part))
            {
                part.Snapped = true;
                StartCoroutine(TweenTo(part, part.Item.targetTweenDuration));
                return;
            }
            var other = Parts.Find(o => o != part && o.Target.gameObject.activeInHierarchy &&
                                        Vector3.ProjectOnPlane(part.Moved.position - o.Target.position, _stage.Space.up).magnitude <= Reach(o));
            if (other != null && !string.IsNullOrEmpty(part.Item.fits) && part.Item.fits == other.Item.fits)
            {
                part.Snapped = true;
                StartCoroutine(TweenTo(part, part.Item.targetTweenDuration));
                return;
            }
            if (other != null) Misfit?.Invoke(part, other);
            StartCoroutine(TweenHome(part, part.Item.returnDuration));
        }

        // A part's catchment: its own radius when the activity sets one (ports a
        // finger-width apart), otherwise one that grows with the footprint.
        private float Reach(Part p) => p.Item.snapRadius > 0
            ? p.Item.snapRadius * _stage.Content.lossyScale.x
            : Mathf.Max(0.06f, Mathf.Max(_stage.Footprint.x, _stage.Footprint.y) * 0.12f);

        private bool Guided(Part p) => p.Item.lift > 0 || p.Item.approach != null;

        private float CarryHeight(Part p) => p.Target.position.y + p.Item.lift * _stage.Content.lossyScale.x;

        private Vector3 ApproachPoint(Part p) =>
            p.Item.approach == null ? p.Target.position : p.Target.TransformPoint(new Vector3(p.Item.approach.x, p.Item.approach.y, p.Item.approach.z));

        private static Vector3 Bezier(Vector3 a, Vector3 b, Vector3 c, Vector3 d, float t)
        {
            var u = 1 - t;
            return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
        }

        private static float Smooth(float x)
        {
            x = Mathf.Clamp01(x);
            return x * x * (3 - 2 * x);
        }

        // Up over whatever is in the way, across, down to the point lined up with the slot or port, then
        // straight in, as hands fit a real part.
        private IEnumerator GuidedTo(Part p, Vector3 endPos, Quaternion endRot, Vector3 endScale, Vector3 approach, float travel, float insert)
        {
            var t = p.Moved;
            var start = t.position;
            var startRot = t.rotation;
            var startScale = t.localScale;
            var high = Mathf.Max(start.y, Mathf.Max(approach.y, CarryHeight(p)));
            var b = new Vector3(start.x, high, start.z);
            var c = new Vector3(approach.x, high, approach.z);
            for (var e = 0f; e < travel; e += Time.deltaTime)
            {
                var k = Smooth(e / travel);
                t.position = Bezier(start, b, c, approach, k);
                t.rotation = Quaternion.Slerp(startRot, endRot, Smooth(e / (travel * 0.8f)));
                t.localScale = Vector3.Lerp(startScale, endScale, k);
                yield return null;
            }
            t.position = approach;
            t.rotation = endRot;
            t.localScale = endScale;
            for (var e = 0f; e < insert; e += Time.deltaTime)
            {
                t.position = Vector3.Lerp(approach, endPos, Smooth(e / insert));
                yield return null;
            }
            t.position = endPos;
        }

        private IEnumerator TweenTo(Part p, float duration)
        {
            if (Guided(p))
            {
                yield return GuidedTo(p, p.Target.position, p.Target.rotation, TrayScale(p), ApproachPoint(p),
                    Mathf.Max(0.55f, duration * 1.4f), 0.4f);
                UpdateGhosts();
                Snapped?.Invoke(p);
                yield break;
            }
            var t = p.Moved;
            var fromPos = t.position;
            var fromRot = t.rotation;
            var fromScale = t.localScale;
            var toScale = TrayScale(p);
            for (var e = 0f; e < duration; e += Time.deltaTime)
            {
                var k = Ease(e / Mathf.Max(0.01f, duration));
                t.position = Vector3.Lerp(fromPos, p.Target.position, k);
                t.rotation = Quaternion.Slerp(fromRot, p.Target.rotation, k);
                t.localScale = Vector3.Lerp(fromScale, toScale, k);
                yield return null;
            }
            t.position = p.Target.position;
            t.rotation = p.Target.rotation;
            t.localScale = toScale;
            UpdateGhosts();
            Snapped?.Invoke(p);
        }

        // The size a part takes in its tray: the tray target's own scale (as authored), then shrunk further
        // if it would still be wider than the tray.
        private static Vector3 TrayScale(Part p)
        {
            var t = p.Moved;
            var parent = t.parent != null ? t.parent.lossyScale : Vector3.one;
            var target = p.Target.lossyScale;
            var scale = new Vector3(
                p.HomeScale.x * Ratio(target.x, parent.x * p.HomeScale.x),
                p.HomeScale.y * Ratio(target.y, parent.y * p.HomeScale.y),
                p.HomeScale.z * Ratio(target.z, parent.z * p.HomeScale.z));
            // Keep proportions: use the smallest factor on all axes.
            var factor = Mathf.Min(scale.x / p.HomeScale.x, Mathf.Min(scale.y / p.HomeScale.y, scale.z / p.HomeScale.z));
            if (float.IsNaN(factor) || factor <= 0 || factor > 1.5f) factor = 1f;
            var fitted = p.HomeScale * factor;

            var trayWidth = p.Item.snapRadius > 0 ? 0 : Width(p.Tray != null ? p.Tray : p.Target.parent);
            if (trayWidth > 0)
            {
                // Measured at its current size, then scaled: bounds grow in step with scale.
                var now = Mathf.Max(Mathf.Abs(t.localScale.x), 1e-6f);
                var partWidth = Width(t) * Mathf.Abs(fitted.x) / now;
                if (partWidth > trayWidth * 0.8f) fitted *= trayWidth * 0.8f / partWidth;
            }
            return fitted;
        }

        private static float Ratio(float target, float current) =>
            Mathf.Abs(current) < 1e-6f ? 1f : Mathf.Abs(target / current);

        /// <summary>The widest horizontal extent of everything drawn under a transform.</summary>
        private static float Width(Transform root)
        {
            if (root == null) return 0;
            var any = false;
            var b = new Bounds();
            foreach (var r in root.GetComponentsInChildren<Renderer>(false))
            {
                if (r is ParticleSystemRenderer || r is LineRenderer) continue;
                if (r.GetComponentInParent<Canvas>() != null) continue; // the tray's label pin
                if (!any) { b = r.bounds; any = true; } else b.Encapsulate(r.bounds);
            }
            return any ? Mathf.Max(b.size.x, b.size.z) : 0;
        }

        private IEnumerator TweenHome(Part p, float duration)
        {
            var t = p.Moved;
            if (t.parent != p.HomeParent) t.SetParent(p.HomeParent, true);
            if (Guided(p) && p.HomeParent != null)
            {
                var homePos = p.HomeParent.TransformPoint(p.HomePosition);
                var homeRot = p.HomeParent.rotation * p.HomeRotation;
                var outOf = t.position;
                if (p.Item.approach != null && Vector3.Distance(t.position, p.Target.position) < 0.002f)
                {
                    var back = ApproachPoint(p);
                    for (var e = 0f; e < 0.3f; e += Time.deltaTime)
                    {
                        t.position = Vector3.Lerp(outOf, back, Smooth(e / 0.3f));
                        yield return null;
                    }
                }
                yield return GuidedTo(p, homePos, homeRot, p.HomeScale, homePos, Mathf.Max(0.5f, duration * 1.6f), 0f);
                t.localPosition = p.HomePosition;
                t.localRotation = p.HomeRotation;
                t.localScale = p.HomeScale;
                UpdateGhosts();
                yield break;
            }
            var fromPos = t.localPosition;
            var fromRot = t.localRotation;
            var fromScale = t.localScale;
            for (var e = 0f; e < duration; e += Time.deltaTime)
            {
                var k = Ease(e / Mathf.Max(0.01f, duration));
                t.localPosition = Vector3.Lerp(fromPos, p.HomePosition, k);
                t.localRotation = Quaternion.Slerp(fromRot, p.HomeRotation, k);
                t.localScale = Vector3.Lerp(fromScale, p.HomeScale, k);
                yield return null;
            }
            t.localPosition = p.HomePosition;
            t.localRotation = p.HomeRotation;
            t.localScale = p.HomeScale;
            UpdateGhosts();
        }

        private static float Ease(float x) => 1 - Mathf.Pow(1 - Mathf.Clamp01(x), 3);

        // ---- whole-activity tools ------------------------------------------------

        private void MoveAll(Vector2 screen, Vector2 delta)
        {
            var cam = ArRig.Instance.Camera;
            var floor = _stage.FloorPlane;
            var now = cam.ScreenPointToRay(screen);
            var before = cam.ScreenPointToRay(screen - delta);
            if (floor.Raycast(now, out var a) && floor.Raycast(before, out var b))
                _stage.MoveBy(now.GetPoint(a) - before.GetPoint(b));
        }

        private Vector3 SurfacePoint(Vector2 screen)
        {
            var ray = ArRig.Instance.Camera.ScreenPointToRay(screen);
            if (Physics.Raycast(ray, out var hit, 20f)) return hit.point - ray.direction * 0.004f;
            if (_stage.FloorPlane.Raycast(ray, out var enter)) return ray.GetPoint(enter) + _stage.Space.up * 0.003f;
            return ray.GetPoint(0.5f);
        }

        private void BeginStroke(Vector2 screen)
        {
            var go = new GameObject("Stroke");
            go.transform.SetParent(_stage.Content, true);
            _stroke = go.AddComponent<LineRenderer>();
            _stroke.sharedMaterial = Materials.Ink;
            _stroke.widthMultiplier = 0.006f;
            _stroke.numCapVertices = 4;
            _stroke.numCornerVertices = 4;
            _stroke.useWorldSpace = false;
            _stroke.positionCount = 1;
            _stroke.SetPosition(0, go.transform.InverseTransformPoint(SurfacePoint(screen)));
            var col = go.AddComponent<SphereCollider>();
            col.isTrigger = true;
            col.radius = 0.02f;
            col.center = _stroke.GetPosition(0);
            _strokes.Add(_stroke);
        }

        private void ExtendStroke(Vector2 screen)
        {
            if (_stroke == null) return;
            var p = _stroke.transform.InverseTransformPoint(SurfacePoint(screen));
            if (Vector3.Distance(p, _stroke.GetPosition(_stroke.positionCount - 1)) < 0.004f) return;
            _stroke.positionCount++;
            _stroke.SetPosition(_stroke.positionCount - 1, p);
        }

        private void EraseAt(Vector2 screen)
        {
            var cam = ArRig.Instance.Camera;
            for (var i = _strokes.Count - 1; i >= 0; i--)
            {
                var s = _strokes[i];
                if (s == null) { _strokes.RemoveAt(i); continue; }
                for (var k = 0; k < s.positionCount; k++)
                {
                    var sp = cam.WorldToScreenPoint(s.transform.TransformPoint(s.GetPosition(k)));
                    if (sp.z > 0 && Vector2.Distance(sp, screen) < Screen.dpi * 0.12f)
                    {
                        Destroy(s.gameObject);
                        _strokes.RemoveAt(i);
                        break;
                    }
                }
            }
        }
    }
}
