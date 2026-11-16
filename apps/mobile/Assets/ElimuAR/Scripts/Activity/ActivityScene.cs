using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.SceneManagement;

namespace ElimuAR
{
    /// <summary>An activity's 3D content, loaded from its bundle.</summary>
    public class ActivityScene
    {
        public Transform Root { get; private set; }
        public ActivityManifest Manifest { get; private set; }
        public Vector2 Footprint { get; private set; }
        public float BaseScale { get; private set; } = 1f;

        private AssetBundle _bundle;
        private string _scenePath;
        private readonly Dictionary<string, AudioClip> _clips = new Dictionary<string, AudioClip>();
        private readonly Dictionary<string, Transform> _paths = new Dictionary<string, Transform>();

        public static IEnumerator Load(string bundlePath, ActivityManifest manifest, Transform parent,
            Action<ActivityScene> ok, Action<string> fail)
        {
            var scene = new ActivityScene { Manifest = manifest };
            var request = AssetBundle.LoadFromFileAsync(bundlePath);
            yield return request;
            scene._bundle = request.assetBundle;
            if (scene._bundle == null)
            {
                fail("This activity's file could not be opened. Remove it and download it again.");
                yield break;
            }
            var paths = scene._bundle.GetAllScenePaths();
            scene._scenePath = paths.FirstOrDefault(p => p == manifest.scenePath) ?? paths.FirstOrDefault();
            if (scene._scenePath == null)
            {
                scene.Unload();
                fail("This activity's file has no scene in it.");
                yield break;
            }

            var load = SceneManager.LoadSceneAsync(scene._scenePath, LoadSceneMode.Additive);
            yield return load;
            var loaded = SceneManager.GetSceneByPath(scene._scenePath);
            if (!loaded.IsValid())
            {
                scene.Unload();
                fail("This activity's scene did not load.");
                yield break;
            }

            var rootName = (manifest.rootPath ?? "").Split('/')[0];
            GameObject root = null;
            foreach (var go in loaded.GetRootGameObjects())
            {
                if (go.name == rootName) root = go;
                // The authoring scene's own camera, listener and input belong to
                // the editor it was made in, not to the room it is shown in.
                foreach (var cam in go.GetComponentsInChildren<Camera>(true)) UnityEngine.Object.Destroy(cam.gameObject);
                foreach (var es in go.GetComponentsInChildren<EventSystem>(true)) UnityEngine.Object.Destroy(es.gameObject);
            }
            if (root == null)
            {
                scene.Unload();
                fail("This activity's model was not found in its scene.");
                yield break;
            }

            // Lights stay with the activity so it is lit the way it was authored.
            foreach (var go in loaded.GetRootGameObjects())
            {
                if (go == root) continue;
                var light = go.GetComponentInChildren<Light>(true);
                if (light != null && go.GetComponentsInChildren<Renderer>(true).Length == 0)
                {
                    go.transform.SetParent(root.transform, true);
                }
            }

            SceneManager.MoveGameObjectToScene(root, SceneManager.GetActiveScene());
            root.transform.SetParent(parent, false);
            root.transform.localPosition = Vector3.zero;
            root.transform.localRotation = Quaternion.identity;
            scene.Root = root.transform;

            foreach (var rb in root.GetComponentsInChildren<Rigidbody>(true))
            {
                rb.isKinematic = true;
                rb.useGravity = false;
            }
            ShaderFix.Apply(root);
            scene.CollectClips();

            yield return SceneManager.UnloadSceneAsync(loaded);
            scene.Remeasure();
            ok(scene);
        }

        private void CollectClips()
        {
            // Clips the scene referenced are loaded with it; they are found by name.
            foreach (var clip in Resources.FindObjectsOfTypeAll<AudioClip>())
                if (!_clips.ContainsKey(clip.name)) _clips[clip.name] = clip;
        }

        public AudioClip Clip(string name) =>
            !string.IsNullOrEmpty(name) && _clips.TryGetValue(name, out var c) ? c : null;

        /// <summary>The object at a manifest path ("Root/Child/Part"), active or not.</summary>
        public Transform Find(string path)
        {
            if (string.IsNullOrEmpty(path) || Root == null) return null;
            if (_paths.TryGetValue(path, out var cached) && cached != null) return cached;
            var parts = path.Split('/');
            Transform node = parts[0] == Root.name ? Root : null;
            for (var i = 1; node != null && i < parts.Length; i++) node = Child(node, parts[i]);
            // A step names its root by name alone ("HumanEyeExplore3D").
            if (node == null && parts.Length == 1) node = Deep(Root, parts[0]);
            _paths[path] = node;
            return node;
        }

        private static Transform Child(Transform parent, string name)
        {
            for (var i = 0; i < parent.childCount; i++)
                if (parent.GetChild(i).name == name) return parent.GetChild(i);
            return null;
        }

        private static Transform Deep(Transform parent, string name)
        {
            if (parent.name == name) return parent;
            for (var i = 0; i < parent.childCount; i++)
            {
                var found = Deep(parent.GetChild(i), name);
                if (found != null) return found;
            }
            return null;
        }

        // The activity is sized for a tabletop: kept at its authored size when that already fits, otherwise
        // scaled so its widest side is ~0.7 m.
        public void Remeasure()
        {
            var size = MeasureVisible(Root, out var any);
            if (!any) size = new Vector3(0.5f, 0.3f, 0.4f);
            var widest = Mathf.Max(size.x, size.z);
            // Authored size, always: the person in Circulatory System is life-size, the eye and lungs desk-size.
            var largest = Mathf.Max(size.x, Mathf.Max(size.y, size.z));
            BaseScale = largest < 0.10f ? 0.3f / Mathf.Max(0.005f, largest) : largest > 3f ? 1.5f / largest : 1f;
            size *= BaseScale;
            Footprint = new Vector2(Mathf.Clamp(size.x, 0.25f, 2.5f), Mathf.Clamp(size.z, 0.2f, 2.5f));
            Debug.Log($"[ElimuAR] {Root.name}: visible size {size.x:F2} x {size.y:F2} x {size.z:F2} m, " +
                      $"{Root.GetComponentsInChildren<Renderer>(true).Length} renderers, scale {BaseScale}");
        }

        /// <summary>The size, in the root's own space, of every mesh switched on within the root.</summary>
        public static Vector3 MeasureVisible(Transform root, out bool any)
        {
            any = false;
            var bounds = new Bounds();
            var toRoot = root.worldToLocalMatrix;
            foreach (var mf in root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (mf.sharedMesh == null || !OnWithin(mf.transform, root)) continue;
                var r = mf.GetComponent<Renderer>();
                if (r == null || !r.enabled) continue;
                var m = toRoot * mf.transform.localToWorldMatrix;
                var b = mf.sharedMesh.bounds;
                foreach (var corner in Corners(b))
                {
                    var p = m.MultiplyPoint3x4(corner);
                    if (!any) { bounds = new Bounds(p, Vector3.zero); any = true; }
                    else bounds.Encapsulate(p);
                }
            }
            foreach (var smr in root.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            {
                if (smr.sharedMesh == null || !smr.enabled || !OnWithin(smr.transform, root)) continue;
                var m = toRoot * smr.transform.localToWorldMatrix;
                foreach (var corner in Corners(smr.sharedMesh.bounds))
                {
                    var p = m.MultiplyPoint3x4(corner);
                    if (!any) { bounds = new Bounds(p, Vector3.zero); any = true; }
                    else bounds.Encapsulate(p);
                }
            }
            return Vector3.Scale(bounds.size, root.lossyScale);
        }

        private static bool OnWithin(Transform t, Transform root)
        {
            for (var n = t; n != null; n = n.parent)
            {
                if (!n.gameObject.activeSelf) return false;
                if (n == root) return true;
            }
            return true;
        }

        private static IEnumerable<Vector3> Corners(Bounds b)
        {
            for (var i = 0; i < 8; i++)
                yield return b.center + Vector3.Scale(b.extents,
                    new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
        }

        // Stands what is showing on the anchored spot: the lowest visible point at the surface, centred over
        // the anchor.
        public void Ground()
        {
            if (Root == null) return;
            var saved = Root.localPosition;
            Root.localPosition = Vector3.zero;
            var any = false;
            var b = new Bounds();
            var toParent = Root.parent != null ? Root.parent.worldToLocalMatrix : Matrix4x4.identity;
            foreach (var mf in Root.GetComponentsInChildren<MeshFilter>(true))
            {
                if (mf.sharedMesh == null || !OnWithin(mf.transform, Root)) continue;
                var r = mf.GetComponent<Renderer>();
                if (r == null || !r.enabled) continue;
                Add(mf.sharedMesh.bounds, toParent * mf.transform.localToWorldMatrix, ref b, ref any);
            }
            foreach (var smr in Root.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            {
                if (smr.sharedMesh == null || !smr.enabled || !OnWithin(smr.transform, Root)) continue;
                Add(smr.sharedMesh.bounds, toParent * smr.transform.localToWorldMatrix, ref b, ref any);
            }
            if (!any) { Root.localPosition = saved; return; }
            Root.localPosition = new Vector3(-b.center.x, -b.min.y, -b.center.z);
            Debug.Log($"[ElimuAR] grounded {Root.name}: lifted {-b.min.y:F3} m, centred by ({-b.center.x:F3}, {-b.center.z:F3})");
        }

        private static void Add(Bounds local, Matrix4x4 m, ref Bounds b, ref bool any)
        {
            foreach (var corner in Corners(local))
            {
                var p = m.MultiplyPoint3x4(corner);
                if (!any) { b = new Bounds(p, Vector3.zero); any = true; }
                else b.Encapsulate(p);
            }
        }

        public void Unload()
        {
            if (Root != null) UnityEngine.Object.Destroy(Root.gameObject);
            Root = null;
            if (_bundle != null) _bundle.Unload(true);
            _bundle = null;
            _clips.Clear();
            _paths.Clear();
        }
    }

    // Bundles carry shaders compiled by the engine version they were built with; on this engine those copies
    // can draw nothing at all.
    public static class ShaderFix
    {
        private static readonly int BaseMap = Shader.PropertyToID("_BaseMap");
        private static readonly int MainTex = Shader.PropertyToID("_MainTex");
        private static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        private static readonly int Color = Shader.PropertyToID("_Color");

        public static void Apply(GameObject root)
        {
            var done = new Dictionary<Material, Material>();
            int remapped = 0, replaced = 0;

            Material Fix(Material m)
            {
                if (m == null) return null;
                if (done.TryGetValue(m, out var known)) return known;
                var result = m;
                var local = m.shader != null ? Shader.Find(m.shader.name) : null;
                if (local != null && local.isSupported)
                {
                    var queue = m.renderQueue;
                    m.shader = local;
                    m.renderQueue = queue;
                    remapped++;
                }
                else
                {
                    result = Replace(m);
                    replaced++;
                }
                done[m] = result;
                return result;
            }

            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
            {
                var mats = r.sharedMaterials;
                for (var i = 0; i < mats.Length; i++) mats[i] = Fix(mats[i]);
                r.sharedMaterials = mats;
            }
            foreach (var t in root.GetComponentsInChildren<TMPro.TMP_Text>(true))
            {
                if (t.font != null && t.font.material != null) t.font.material = Fix(t.font.material);
                if (t.fontSharedMaterial != null) t.fontSharedMaterial = Fix(t.fontSharedMaterial);
            }
            Debug.Log($"[ElimuAR] materials: {remapped} moved onto this build's shaders, {replaced} replaced");
        }

        private static Material Replace(Material m)
        {
            var transparent = m.renderQueue >= 2900 || (m.HasProperty("_Surface") && m.GetFloat("_Surface") > 0.5f);
            var unlit = m.shader != null && m.shader.name.ToLowerInvariant().Contains("unlit");
            var template = unlit ? Materials.Unlit : transparent ? Materials.LitTransparent : Materials.Lit;
            var copy = new Material(template) { name = m.name + " (ElimuAR)" };
            Texture tex = m.HasProperty(BaseMap) ? m.GetTexture(BaseMap) : m.HasProperty(MainTex) ? m.GetTexture(MainTex) : null;
            var color = m.HasProperty(BaseColor) ? m.GetColor(BaseColor) : m.HasProperty(Color) ? m.GetColor(Color) : UnityEngine.Color.white;
            if (tex != null) copy.SetTexture(BaseMap, tex);
            copy.SetColor(BaseColor, color);
            return copy;
        }
    }
}
