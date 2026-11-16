using UnityEngine;
using UnityEngine.XR.ARFoundation;

namespace ElimuAR
{
    /// <summary>Where the activity lives in the room.</summary>
    public class Stage : MonoBehaviour
    {
        public Transform Space { get; private set; }     // follows the anchor
        public Transform Content { get; private set; }   // the activity, moved/rotated/scaled by the tools
        public bool Anchored { get; private set; }
        public bool SurfaceInView { get; private set; }
        public Vector2 Footprint = new Vector2(0.6f, 0.4f);

        private Transform _reticle;
        private Transform _mat;
        private ARAnchor _anchor;
        private Pose _lastPose;
        private bool _searching;
        private float _baseScale = 1f;

        public static Stage Create()
        {
            var go = new GameObject("ElimuAR-Stage");
            DontDestroyOnLoad(go);
            var stage = go.AddComponent<Stage>();
            stage.Build();
            return stage;
        }

        private void Build()
        {
            Space = new GameObject("Activity Space").transform;
            Space.SetParent(transform, false);
            Content = new GameObject("Activity Content").transform;
            Content.SetParent(Space, false);

            _reticle = Quad("Reticle", Materials.Reticle, transform).transform;
            _reticle.gameObject.SetActive(false);

            _mat = Quad("Surface Mat", Materials.Mat, Space).transform;
            _mat.gameObject.SetActive(false);
            Space.gameObject.SetActive(false);
        }

        private static GameObject Quad(string name, Material material, Transform parent)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            go.name = name;
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localRotation = Quaternion.Euler(90, 0, 0);
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return go;
        }

        public void BeginSearch()
        {
            _searching = true;
            Anchored = false;
            Space.gameObject.SetActive(false);
            ArRig.Instance.SetGuides(true);
        }

        public void EndSearch()
        {
            _searching = false;
            SurfaceInView = false;
            _reticle.gameObject.SetActive(false);
        }

        private void Update()
        {
            if (!_searching || Anchored) return;
            var center = new Vector2(Screen.width / 2f, Screen.height / 2f);
            SurfaceInView = ArRig.Instance.HitSurface(center, out var pose, out _);
            _reticle.gameObject.SetActive(SurfaceInView);
            if (!SurfaceInView) return;
            _lastPose = pose;
            var cam = ArRig.Instance.Camera.transform;
            var flatForward = Vector3.ProjectOnPlane(cam.forward, Vector3.up);
            var yaw = flatForward.sqrMagnitude > 1e-4f ? Quaternion.LookRotation(flatForward) : Quaternion.identity;
            _reticle.position = pose.position + Vector3.up * 0.002f;
            _reticle.rotation = yaw * Quaternion.Euler(90, 0, 0);
            var s = Mathf.Max(0.12f, Mathf.Min(Footprint.x, Footprint.y) * 0.3f);
            _reticle.localScale = new Vector3(s, s, 1);
        }

        /// <summary>Fixes the activity space on the surface the reticle is on.</summary>
        public bool AnchorHere()
        {
            if (!SurfaceInView) return false;
            var cam = ArRig.Instance.Camera.transform;
            var toCamera = Vector3.ProjectOnPlane(cam.position - _lastPose.position, Vector3.up);
            var facing = toCamera.sqrMagnitude > 1e-4f ? Quaternion.LookRotation(-toCamera) : Quaternion.identity;
            Space.SetPositionAndRotation(_lastPose.position, facing);
            Space.SetParent(transform, true);
            Content.localPosition = Vector3.zero;
            Content.localRotation = Quaternion.identity;
            Content.localScale = Vector3.one * _baseScale;
            SnapTargets();
            AttachAnchor(new Pose(_lastPose.position, facing));
            Space.gameObject.SetActive(true);
            Anchored = true;
            _reticle.gameObject.SetActive(false);
            return true;
        }

        private async void AttachAnchor(Pose pose)
        {
            ClearAnchor();
            var manager = ArRig.Instance.Anchors;
            if (manager == null || !manager.enabled) return;
            try
            {
                var result = await manager.TryAddAnchorAsync(pose);
                if (result.status.IsSuccess() && result.value != null && Anchored)
                {
                    _anchor = result.value;
                    Space.SetParent(_anchor.transform, true);
                }
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[ElimuAR] anchor not attached: " + e.Message);
            }
        }

        private void ClearAnchor()
        {
            if (_anchor == null) return;
            Space.SetParent(transform, true);
            Destroy(_anchor.gameObject);
            _anchor = null;
        }

        /// <summary>No AR on this device: the activity sits a little in front of the camera.</summary>
        public void PlaceInFront(Transform camera)
        {
            ClearAnchor();
            var forward = Vector3.ProjectOnPlane(camera.forward, Vector3.up);
            if (forward.sqrMagnitude < 1e-4f) forward = Vector3.forward;
            Space.SetPositionAndRotation(camera.position + forward.normalized * 1.1f + Vector3.down * 0.35f,
                Quaternion.LookRotation(forward));
            Space.gameObject.SetActive(true);
            Anchored = true;
        }

        public void ResetAnchor()
        {
            ClearAnchor();
            Anchored = false;
            Space.gameObject.SetActive(false);
            BeginSearch();
        }

        /// <summary>The model's footprint decides the reticle and the mat under it.</summary>
        public void Configure(Vector2 footprint, float baseScale, bool showMat)
        {
            Footprint = footprint;
            _baseScale = baseScale;
            Content.localScale = Vector3.one * baseScale;
            SnapTargets();
            _mat.gameObject.SetActive(showMat);
            _mat.localScale = new Vector3(footprint.x * 1.25f, footprint.y * 1.25f, 1);
            _mat.localPosition = new Vector3(0, 0.001f, 0);
        }

        public void ShowMat(bool on) => _mat.gameObject.SetActive(on);

        public void Clear()
        {
            ClearAnchor();
            EndSearch();
            Anchored = false;
            Space.SetParent(transform, false);
            Space.localPosition = Vector3.zero;
            Space.localRotation = Quaternion.identity;
            Content.localPosition = Vector3.zero;
            Content.localRotation = Quaternion.identity;
            Content.localScale = Vector3.one;
            SnapTargets();
            Space.gameObject.SetActive(false);
            for (var i = Content.childCount - 1; i >= 0; i--) Destroy(Content.GetChild(i).gameObject);
        }

        // ---- the tools ----------------------------------------------------------

        // The tools set where the activity should be; LateUpdate glides it
        // there, so a jittery finger still gives a smooth turn, move or resize.
        private Vector3 _targetPosition;
        private float _targetYaw, _currentYaw;
        private float _targetScale = 1f;
        private const float Smoothing = 14f;

        private void SnapTargets()
        {
            _targetPosition = Content.localPosition;
            _targetYaw = _currentYaw = Content.localEulerAngles.y;
            _targetScale = Content.localScale.x;
        }

        public void MoveBy(Vector3 worldDelta)
        {
            worldDelta.y = 0;
            _targetPosition += Space.InverseTransformVector(worldDelta);
        }

        public void RotateBy(float degrees) => _targetYaw += degrees;

        public void ScaleBy(float factor)
        {
            _targetScale = Mathf.Clamp(_targetScale * factor, _baseScale * 0.25f, _baseScale * 4f);
        }

        private void LateUpdate()
        {
            if (Content == null || !Space.gameObject.activeInHierarchy) return;
            var k = 1f - Mathf.Exp(-Smoothing * Time.unscaledDeltaTime);
            Content.localPosition = Vector3.Lerp(Content.localPosition, _targetPosition, k);
            _currentYaw = Mathf.Lerp(_currentYaw, _targetYaw, k);
            Content.localRotation = Quaternion.Euler(0, _currentYaw, 0);
            var scale = Mathf.Lerp(Content.localScale.x, _targetScale, k);
            Content.localScale = new Vector3(scale, scale, scale);
        }

        /// <summary>The height of the activity floor, for dragging in its plane.</summary>
        public Plane FloorPlane => new Plane(Space.up, Space.position);
    }
}
