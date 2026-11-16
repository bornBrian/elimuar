using System.Collections.Generic;
using Unity.XR.CoreUtils;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.XR;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;

namespace ElimuAR
{
    // The AR session, built in code: ARSession, an XR Origin whose camera draws the passthrough feed, and
    // plane, raycast and anchor managers.
    public class ArRig : MonoBehaviour
    {
        public static ArRig Instance { get; private set; }

        public Camera Camera { get; private set; }
        public ARSession Session { get; private set; }
        public XROrigin Origin { get; private set; }
        public ARPlaneManager Planes { get; private set; }
        public ARRaycastManager Raycasts { get; private set; }
        public ARAnchorManager Anchors { get; private set; }
        public ARCameraManager CameraManager { get; private set; }
        public bool ArAvailable { get; private set; } = true;

        private GameObject _planeTemplate;
        private bool _guides = true;
        private bool _running;
        private static readonly List<ARRaycastHit> Hits = new List<ARRaycastHit>();

        public static ArRig Create()
        {
            var go = new GameObject("ElimuAR-AR");
            DontDestroyOnLoad(go);
            var rig = go.AddComponent<ArRig>();
            rig.Build();
            return rig;
        }

        private void Build()
        {
            Instance = this;

            var sessionGo = new GameObject("AR Session");
            sessionGo.transform.SetParent(transform, false);
            Session = sessionGo.AddComponent<ARSession>();
            // The camera feed is 30 fps, but the models and the UI draw at 60:
            // without this the session holds the whole app to the camera's rate.
            Session.matchFrameRateRequested = false;
            Application.targetFrameRate = 60;
            sessionGo.AddComponent<ARInputManager>();

            var originGo = new GameObject("XR Origin");
            originGo.transform.SetParent(transform, false);
            var offset = new GameObject("Camera Offset");
            offset.transform.SetParent(originGo.transform, false);

            var camGo = new GameObject("AR Camera") { tag = "MainCamera" };
            camGo.transform.SetParent(offset.transform, false);
            Camera = camGo.AddComponent<Camera>();
            Camera.clearFlags = CameraClearFlags.SolidColor;
            Camera.backgroundColor = Theme.Paper;
            Camera.nearClipPlane = 0.03f;
            Camera.farClipPlane = 60f;
            camGo.AddComponent<AudioListener>();
            CameraManager = camGo.AddComponent<ARCameraManager>();
            CameraManager.autoFocusRequested = true;
            camGo.AddComponent<ARCameraBackground>();

            var pose = camGo.AddComponent<TrackedPoseDriver>();
            pose.positionInput = new InputActionProperty(new InputAction("Position", binding: "<HandheldARInputDevice>/devicePosition"));
            pose.rotationInput = new InputActionProperty(new InputAction("Rotation", binding: "<HandheldARInputDevice>/deviceRotation"));
            pose.trackingType = TrackedPoseDriver.TrackingType.RotationAndPosition;

            Origin = originGo.AddComponent<XROrigin>();
            Origin.Camera = Camera;
            Origin.CameraFloorOffsetObject = offset;
            Origin.RequestedTrackingOriginMode = XROrigin.TrackingOriginMode.Device;

            _planeTemplate = BuildPlaneTemplate();
            originGo.SetActive(false);
            Planes = originGo.AddComponent<ARPlaneManager>();
            Planes.planePrefab = _planeTemplate;
            Planes.requestedDetectionMode = PlaneDetectionMode.Horizontal;
            Raycasts = originGo.AddComponent<ARRaycastManager>();
            Anchors = originGo.AddComponent<ARAnchorManager>();
            originGo.SetActive(true);
            Planes.trackablesChanged.AddListener(OnPlanesChanged);

            SetRunning(false);
        }

        /// <summary>The surface guide: a soft white wash and a thin outline.</summary>
        private GameObject BuildPlaneTemplate()
        {
            var go = new GameObject("Plane Template");
            go.SetActive(false);
            go.transform.SetParent(transform, false);
            go.AddComponent<ARPlane>();
            go.AddComponent<MeshFilter>();
            var renderer = go.AddComponent<MeshRenderer>();
            renderer.sharedMaterial = Materials.PlaneWash;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var line = go.AddComponent<LineRenderer>();
            line.sharedMaterial = Materials.PlaneLine;
            line.widthMultiplier = 0.004f;
            line.useWorldSpace = false;
            line.loop = true;
            line.numCornerVertices = 2;
            go.AddComponent<ARPlaneMeshVisualizer>();
            return go;
        }

        private void OnPlanesChanged(ARTrackablesChangedEventArgs<ARPlane> args)
        {
            foreach (var plane in args.added) ShowPlane(plane, _guides);
        }

        private static void ShowPlane(ARPlane plane, bool on)
        {
            var r = plane.GetComponent<MeshRenderer>();
            if (r) r.enabled = on;
            var l = plane.GetComponent<LineRenderer>();
            if (l) l.enabled = on;
        }

        /// <summary>The surface guides belong to Setup; the anchored space is drawn without them.</summary>
        public void SetGuides(bool on)
        {
            _guides = on && Settings.SurfaceGuides;
            if (Planes == null) return;
            foreach (var plane in Planes.trackables) ShowPlane(plane, _guides);
        }

        /// <summary>The camera feed and tracking run only while an activity is open.</summary>
        public void SetRunning(bool on)
        {
            _running = on;
            Session.enabled = on;
            Planes.enabled = on;
            CameraManager.enabled = on;
            var bg = Camera.GetComponent<ARCameraBackground>();
            if (bg) bg.enabled = on;
            Camera.clearFlags = CameraClearFlags.SolidColor;
            Camera.backgroundColor = on ? Color.black : Theme.Paper;
            if (!on)
            {
                Camera.transform.localPosition = Vector3.zero;
                Camera.transform.localRotation = Quaternion.identity;
            }
        }

        public System.Collections.IEnumerator Probe()
        {
            if (ARSession.state == ARSessionState.None || ARSession.state == ARSessionState.CheckingAvailability)
                yield return ARSession.CheckAvailability();
            ArAvailable = ARSession.state != ARSessionState.Unsupported;
            if (ARSession.state == ARSessionState.NeedsInstall) yield return ARSession.Install();
        }

        // How far past a found surface's outline the surface is trusted, how far below the phone tracked
        // points must lie to count as a desk or floor.
        private const float Reach = 0.5f;
        private const float PointDrop = 0.15f;
        private const float PointRange = 3.5f;
        private const float Step = 0.08f;

        private float _pointHeight;
        private float _pointSeen = -10f;

        /// <summary>A horizontal surface under the given screen point.</summary>
        public bool HitSurface(Vector2 screen, out Pose pose, out ARPlane plane)
        {
            pose = default;
            plane = null;
            if (!_running || Raycasts == null) return false;

            if (Raycasts.Raycast(screen, Hits, TrackableType.PlaneWithinPolygon))
            {
                foreach (var hit in Hits)
                {
                    var p = Planes.GetPlane(hit.trackableId);
                    if (p != null && p.alignment == PlaneAlignment.HorizontalUp)
                    {
                        pose = hit.pose;
                        plane = p;
                        return true;
                    }
                }
            }

            var ray = Camera.ScreenPointToRay(screen);
            var extended = ExtendedHit(ray, out var extendedPose, out var extendedPlane);
            var pointed = PointHit(screen, ray, out var pointPose);
            if (extended && (!pointed || pointPose.position.y - extendedPose.position.y < Step))
            {
                pose = extendedPose;
                plane = extendedPlane;
                return true;
            }
            if (pointed)
            {
                pose = pointPose;
                return true;
            }
            return false;
        }

        /// <summary>The nearest found desk or floor, carried up to Reach past its outline.</summary>
        private bool ExtendedHit(Ray ray, out Pose pose, out ARPlane plane)
        {
            pose = default;
            plane = null;
            var best = float.MaxValue;
            foreach (var p in Planes.trackables)
            {
                if (p.alignment != PlaneAlignment.HorizontalUp || p.subsumedBy != null) continue;
                var surface = new Plane(Vector3.up, p.center);
                if (!surface.Raycast(ray, out var enter) || enter > PointRange || enter >= best) continue;
                var at = ray.GetPoint(enter);
                var local = p.transform.InverseTransformPoint(at);
                var middle = p.centerInPlaneSpace;
                var outside = new Vector2(Mathf.Max(0, Mathf.Abs(local.x - middle.x) - p.extents.x),
                    Mathf.Max(0, Mathf.Abs(local.z - middle.y) - p.extents.y));
                if (outside.magnitude > Reach) continue;
                best = enter;
                pose = new Pose(at, Quaternion.identity);
                plane = p;
            }
            return plane != null;
        }

        // Before a surface is found: the tracked points well below the phone give the height of the desk or
        // floor, smoothed so the reticle rests on a level surface instead of jumping from point to point.
        private bool PointHit(Vector2 screen, Ray ray, out Pose pose)
        {
            pose = default;
            var eye = Camera.transform.position.y;
            if (Raycasts.Raycast(screen, Hits, TrackableType.FeaturePoint))
            {
                foreach (var hit in Hits)
                {
                    var y = hit.pose.position.y;
                    if (eye - y < PointDrop || hit.distance > PointRange) continue;
                    _pointHeight = Time.time - _pointSeen > 1f ? y : Mathf.Lerp(_pointHeight, y, 0.2f);
                    _pointSeen = Time.time;
                    break;
                }
            }
            if (Time.time - _pointSeen > 1f) return false;
            var level = new Plane(Vector3.up, new Vector3(0, _pointHeight, 0));
            if (!level.Raycast(ray, out var enter) || enter > PointRange) return false;
            pose = new Pose(ray.GetPoint(enter), Quaternion.identity);
            return true;
        }
    }
}
