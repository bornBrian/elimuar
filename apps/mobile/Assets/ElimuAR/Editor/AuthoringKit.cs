using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using TMPro;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;

namespace ElimuAR.Editor
{
    /// <summary>What every activity made in this project is built from.</summary>
    public class AuthoringKit
    {
        public readonly string Key, Folder, Dir, ScenePath, Source, RootName, ObserveName, ExploreName;
        public readonly JObject Content, Timings;
        public Transform Root, Observe, Explore;
        public readonly Dictionary<string, Transform> Labels = new Dictionary<string, Transform>();
        private readonly Dictionary<string, Material> _mats = new Dictionary<string, Material>();
        private readonly TMP_FontAsset _font;

        public AuthoringKit(string key, string folder, string rootName)
        {
            Key = key;
            Folder = folder;
            Dir = "Assets/ElimuARContent/" + folder;
            Source = "Authoring/" + folder;
            ScenePath = $"{Dir}/{key}.unity";
            RootName = rootName;
            ObserveName = folder + "Observe";
            ExploreName = folder + "Explore3D";
            Content = JObject.Parse(File.ReadAllText(Path.Combine(Source, "content.json")));
            Timings = JObject.Parse(File.ReadAllText(Path.Combine(Dir, "Audio/timings.json")));
            Directory.CreateDirectory(Dir + "/Materials");
            _font = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>("Assets/ElimuAR/Resources/Fonts/Montserrat-Bold SDF.asset");
        }

        public Dictionary<string, float> Cues => Timings["cues"].ToObject<Dictionary<string, float>>();
        public List<JObject> Parts => Content["parts"].ToObject<List<JObject>>();
        public string NameOf(string key) => (string)Parts.First(p => (string)p["key"] == key)["name"];

        /// <summary>A new scene with two lights and the activity's root, Observe and Explore objects.</summary>
        public void BeginScene()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var key = new GameObject("Key Light").AddComponent<Light>();
            key.type = LightType.Directional;
            key.intensity = 1.15f;
            key.transform.rotation = Quaternion.Euler(48, -35, 0);
            var fill = new GameObject("Fill Light").AddComponent<Light>();
            fill.type = LightType.Directional;
            fill.intensity = 0.45f;
            fill.shadows = LightShadows.None;
            fill.transform.rotation = Quaternion.Euler(25, 150, 0);
            Root = new GameObject(RootName).transform;
            Observe = new GameObject(ObserveName).transform;
            Observe.SetParent(Root, false);
            Explore = new GameObject(ExploreName).transform;
            Explore.SetParent(Root, false);
            Explore.gameObject.SetActive(false);
        }

        // ---- shapes and materials -------------------------------------------------------------

        public Material Mat(string name, Color color, float metallic = 0.1f, float smooth = 0.45f)
        {
            if (_mats.TryGetValue(name, out var m)) return m;
            var path = $"{Dir}/Materials/{name}.mat";
            m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                AssetDatabase.CreateAsset(m, path);
            }
            m.SetColor("_BaseColor", color);
            m.SetFloat("_Metallic", metallic);
            m.SetFloat("_Smoothness", smooth);
            EditorUtility.SetDirty(m);
            _mats[name] = m;
            return m;
        }

        public Material TexMat(string name, string texture, string normal = null, float metallic = 0f, float smooth = 0.4f, Color? tint = null, float bump = 1f)
        {
            var m = Mat(name, tint ?? Color.white, metallic, smooth);
            var tex = LoadTexture(texture, false);
            if (tex != null) m.SetTexture("_BaseMap", tex);
            if (normal != null)
            {
                var n = LoadTexture(normal, true);
                if (n != null)
                {
                    m.SetTexture("_BumpMap", n);
                    m.SetFloat("_BumpScale", bump);
                    m.EnableKeyword("_NORMALMAP");
                }
            }
            EditorUtility.SetDirty(m);
            return m;
        }

        private Texture2D LoadTexture(string name, bool normal)
        {
            var path = $"{Dir}/Textures/{name}.png";
            if (!File.Exists(path)) return null;
            AssetDatabase.ImportAsset(path);
            if (AssetImporter.GetAtPath(path) is TextureImporter importer)
            {
                var type = normal ? TextureImporterType.NormalMap : TextureImporterType.Default;
                if (importer.textureType != type || importer.maxTextureSize != 2048 || !importer.mipmapEnabled)
                {
                    importer.textureType = type;
                    importer.maxTextureSize = 2048;
                    importer.mipmapEnabled = true;
                    importer.anisoLevel = 4;
                    importer.SaveAndReimport();
                }
            }
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        private readonly Dictionary<string, Mesh> _meshes = new Dictionary<string, Mesh>();

        /// <summary>A box with rounded edges and corners, so light catches its edges as on a real object.</summary>
        public Transform RoundBox(Transform parent, string name, Vector3 at, Vector3 size, float radius, Material mat, Quaternion? rotation = null)
        {
            var key = $"rb_{size.x:0.#####}_{size.y:0.#####}_{size.z:0.#####}_{radius:0.#####}".Replace('.', 'p');
            if (!_meshes.TryGetValue(key, out var mesh))
            {
                Directory.CreateDirectory(Dir + "/Meshes");
                var path = $"{Dir}/Meshes/{key}.asset";
                mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
                if (mesh == null)
                {
                    mesh = RoundBoxMesh(size, radius);
                    mesh.name = key;
                    AssetDatabase.CreateAsset(mesh, path);
                }
                _meshes[key] = mesh;
            }
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            if (rotation.HasValue) go.transform.localRotation = rotation.Value;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        public static Mesh RoundBoxMesh(Vector3 size, float radius, int seg = 5)
        {
            var half = size * 0.5f;
            radius = Mathf.Clamp(radius, 1e-5f, Mathf.Min(half.x, Mathf.Min(half.y, half.z)) - 1e-6f);
            float[] Axis(float h)
            {
                var list = new List<float>();
                for (var k = 0; k <= seg; k++) list.Add(-h + radius * (1 - Mathf.Cos(k / (float)seg * Mathf.PI * 0.5f)));
                for (var k = seg; k >= 0; k--) list.Add(h - radius * (1 - Mathf.Cos(k / (float)seg * Mathf.PI * 0.5f)));
                return list.Distinct().ToArray();
            }
            var axes = new[] { Axis(half.x), Axis(half.y), Axis(half.z) };
            var inner = half - Vector3.one * radius;
            var verts = new List<Vector3>();
            var norms = new List<Vector3>();
            var uvs = new List<Vector2>();
            var tris = new List<int>();
            for (var axis = 0; axis < 3; axis++)
            for (var sign = -1; sign <= 1; sign += 2)
            {
                var u = (axis + 1) % 3;
                var v = (axis + 2) % 3;
                var faceNormal = Vector3.zero;
                faceNormal[axis] = sign;
                var start = verts.Count;
                var au = axes[u];
                var av = axes[v];
                for (var i = 0; i < au.Length; i++)
                for (var j = 0; j < av.Length; j++)
                {
                    var p = Vector3.zero;
                    p[axis] = sign * half[axis];
                    p[u] = au[i];
                    p[v] = av[j];
                    var c = new Vector3(Mathf.Clamp(p.x, -inner.x, inner.x), Mathf.Clamp(p.y, -inner.y, inner.y), Mathf.Clamp(p.z, -inner.z, inner.z));
                    var n = (p - c).normalized;
                    if (n == Vector3.zero) n = faceNormal;
                    verts.Add(c + n * radius);
                    norms.Add(n);
                    uvs.Add(new Vector2((au[i] + half[u]) / size[u], (av[j] + half[v]) / size[v]));
                }
                for (var i = 0; i < au.Length - 1; i++)
                for (var j = 0; j < av.Length - 1; j++)
                {
                    var a = start + i * av.Length + j;
                    var b = a + av.Length;
                    var quad = new[] { a, a + 1, b, b, a + 1, b + 1 };
                    var geo = Vector3.Cross(verts[quad[1]] - verts[quad[0]], verts[quad[2]] - verts[quad[0]]);
                    if (Vector3.Dot(geo, faceNormal) < 0) quad = new[] { a, b, a + 1, b, b + 1, a + 1 };
                    tris.AddRange(quad);
                }
            }
            var mesh = new Mesh();
            mesh.SetVertices(verts);
            mesh.SetNormals(norms);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            return mesh;
        }

        /// <summary>A textured quad laid on a surface: by default flat on top, facing up.</summary>
        public static Transform Decal(Transform parent, string name, Vector3 at, Vector2 size, Material mat, Quaternion? rotation = null)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Quad);
            Object.DestroyImmediate(go.GetComponent<Collider>());
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            go.transform.localRotation = rotation ?? Quaternion.Euler(90, 0, 0);
            go.transform.localScale = new Vector3(size.x, size.y, 1);
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        public static Transform Group(Transform parent, string name, Vector3 at, Quaternion? rotation = null)
        {
            var t = new GameObject(name).transform;
            t.SetParent(parent, false);
            t.localPosition = at;
            if (rotation.HasValue) t.localRotation = rotation.Value;
            return t;
        }

        public static Transform Box(Transform parent, string name, Vector3 at, Vector3 size, Material mat, Quaternion? rotation = null)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.DestroyImmediate(go.GetComponent<Collider>());
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            if (rotation.HasValue) go.transform.localRotation = rotation.Value;
            go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        /// <summary>A cylinder of the given diameter (x, z) and height (y).</summary>
        public static Transform Cylinder(Transform parent, string name, Vector3 at, Vector3 size, Material mat, Quaternion? rotation = null)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Object.DestroyImmediate(go.GetComponent<Collider>());
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            if (rotation.HasValue) go.transform.localRotation = rotation.Value;
            go.transform.localScale = new Vector3(size.x, size.y * 0.5f, size.z);
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        public static Transform Ball(Transform parent, string name, Vector3 at, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Object.DestroyImmediate(go.GetComponent<Collider>());
            go.name = name;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            go.transform.localScale = size;
            go.GetComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        /// <summary>A square fan: frame, hub and seven blades that keep turning.</summary>
        public static void Fan(Transform parent, string name, Vector3 at, float size, Vector3 axis, Material frame, Material blade, bool flat = false)
        {
            var f = Group(parent, name, at,
                axis == Vector3.up ? Quaternion.Euler(90, 0, 0) : axis == Vector3.right ? Quaternion.Euler(0, 90, 0) : Quaternion.identity);
            var t = size * 0.08f;
            if (!flat)
            {
                Box(f, "FrameTop", new Vector3(0, size / 2 - t / 2, 0), new Vector3(size, t, t * 2), frame);
                Box(f, "FrameBottom", new Vector3(0, -size / 2 + t / 2, 0), new Vector3(size, t, t * 2), frame);
                Box(f, "FrameLeft", new Vector3(-size / 2 + t / 2, 0, 0), new Vector3(t, size, t * 2), frame);
                Box(f, "FrameRight", new Vector3(size / 2 - t / 2, 0, 0), new Vector3(t, size, t * 2), frame);
            }
            var rotor = Group(f, "Rotor", Vector3.zero);
            var spin = rotor.gameObject.AddComponent<Spinner>();
            spin.axis = Vector3.forward;
            spin.degreesPerSecond = 600;
            Cylinder(rotor, "Hub", Vector3.zero, new Vector3(size * 0.3f, t, size * 0.3f), frame, Quaternion.Euler(90, 0, 0));
            for (var i = 0; i < 7; i++)
            {
                var b = Box(rotor, "Blade" + i, Vector3.zero, new Vector3(size * 0.16f, size * 0.36f, t * 0.4f), blade);
                b.localRotation = Quaternion.Euler(0, 0, i * 360f / 7);
                b.localPosition = b.localRotation * new Vector3(0, size * 0.24f, 0);
                b.localRotation *= Quaternion.Euler(0, 22, 0);
            }
        }

        /// <summary>One box collider around everything drawn under a part, so a touch anywhere on it grabs it.</summary>
        public static void FitCollider(Transform part)
        {
            var bounds = new Bounds();
            var any = false;
            foreach (var r in part.GetComponentsInChildren<MeshRenderer>())
            {
                var mf = r.GetComponent<MeshFilter>();
                foreach (var c in Corners(mf.sharedMesh.bounds))
                {
                    var p = part.InverseTransformPoint(r.transform.TransformPoint(c));
                    if (!any) { bounds = new Bounds(p, Vector3.zero); any = true; }
                    else bounds.Encapsulate(p);
                }
            }
            var box = part.gameObject.AddComponent<BoxCollider>();
            box.center = bounds.center;
            box.size = bounds.size + Vector3.one * 0.01f;
        }

        private static IEnumerable<Vector3> Corners(Bounds b)
        {
            for (var i = 0; i < 8; i++)
                yield return b.center + Vector3.Scale(b.extents, new Vector3((i & 1) == 0 ? -1 : 1, (i & 2) == 0 ? -1 : 1, (i & 4) == 0 ? -1 : 1));
        }

        // ---- name cards, signs and trays --------------------------------------------------

        /// <summary>A white name card with a red edge, turning to face the viewer.</summary>
        public Transform Card(Transform parent, string name, string text, Vector3 worldAt, float scale, float width = 420, float height = 96,
            float fontSize = 46, Color? background = null, Color? ink = null)
        {
            var root = new GameObject(name).transform;
            root.SetParent(parent, false);
            root.position = worldAt;
            root.gameObject.AddComponent<FaceViewer>();
            var canvasGo = new GameObject("Canvas", typeof(RectTransform));
            canvasGo.transform.SetParent(root, false);
            canvasGo.AddComponent<Canvas>().renderMode = RenderMode.WorldSpace;
            var rt = (RectTransform)canvasGo.transform;
            rt.sizeDelta = new Vector2(width, height);
            rt.localScale = Vector3.one * scale;
            var bg = new GameObject("Card", typeof(RectTransform)).AddComponent<Image>();
            bg.transform.SetParent(rt, false);
            bg.color = background ?? Color.white;
            Stretch(bg.rectTransform);
            var accent = new GameObject("Accent", typeof(RectTransform)).AddComponent<Image>();
            accent.transform.SetParent(rt, false);
            accent.color = new Color(0.89f, 0.14f, 0.1f);
            accent.rectTransform.anchorMin = new Vector2(0, 0);
            accent.rectTransform.anchorMax = new Vector2(0, 1);
            accent.rectTransform.sizeDelta = new Vector2(10, 0);
            accent.rectTransform.anchoredPosition = new Vector2(5, 0);
            var tmp = new GameObject("Text (TMP)", typeof(RectTransform)).AddComponent<TextMeshProUGUI>();
            tmp.transform.SetParent(rt, false);
            tmp.font = _font;
            tmp.text = text;
            tmp.fontSize = fontSize;
            tmp.color = ink ?? new Color(0.12f, 0.12f, 0.12f);
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.textWrappingMode = TextWrappingModes.NoWrap;
            Stretch(tmp.rectTransform);
            return root;
        }

        /// <summary>A name card for Observe that starts hidden (scale 0) and is shown by the timeline.</summary>
        public void Label(string key, string text, Vector3 worldAt)
        {
            var l = Card(Observe, "Label_" + key, text, worldAt, 0.0006f);
            l.localScale = Vector3.zero;
            Labels[key] = l;
        }

        // A small name tag held above the exact spot it names: a dot on the part, a thin line up, and the
        // tag at the top of the line, turning to face the viewer.
        public void Callout(string key, string text, Transform anchor, Vector3 anchorLocal, Vector3 rise)
        {
            var spot = anchor.TransformPoint(anchorLocal);
            var root = new GameObject("Label_" + key).transform;
            root.SetParent(anchor, false);
            root.position = spot + rise;
            root.rotation = Quaternion.identity;
            var white = UnlitMat("CalloutWhite", new Color(1f, 1f, 1f));
            var blue = UnlitMat("CalloutBlue", new Color(0.15f, 0.42f, 0.95f));
            var halo = UnlitMat("CalloutHalo", new Color(1f, 1f, 1f, 0.6f), true);
            var end = root.InverseTransformPoint(spot);
            var dot = Ball(root, "Dot", end, Vector3.one * 0.0062f, blue);
            Ball(dot, "Halo", Vector3.zero, Vector3.one * 1.6f, halo);
            var line = Cylinder(root, "Line", end * 0.5f, new Vector3(0.0011f, end.magnitude, 0.0011f), white);
            line.localRotation = Quaternion.FromToRotation(Vector3.up, end.normalized);

            var tag = new GameObject("Tag").transform;
            tag.SetParent(root, false);
            tag.gameObject.AddComponent<FaceViewer>();
            TagCanvas(tag, text, 0);
            root.localScale = Vector3.zero;
            Labels[key] = root;
        }

        // A small white rounded tag with dark text, standing on its bottom edge (so it can sit on top of a
        // line or a post).
        private RectTransform TagCanvas(Transform parent, string text, float width)
        {
            var canvasGo = new GameObject("Canvas", typeof(RectTransform));
            canvasGo.transform.SetParent(parent, false);
            canvasGo.AddComponent<Canvas>().renderMode = RenderMode.WorldSpace;
            var rt = (RectTransform)canvasGo.transform;
            var bg = new GameObject("Card", typeof(RectTransform)).AddComponent<Image>();
            bg.transform.SetParent(rt, false);
            bg.sprite = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/UISprite.psd");
            bg.type = Image.Type.Sliced;
            bg.pixelsPerUnitMultiplier = 0.3f;
            bg.color = new Color(1f, 1f, 1f, 0.97f);
            Stretch(bg.rectTransform);
            var tmp = new GameObject("Text (TMP)", typeof(RectTransform)).AddComponent<TextMeshProUGUI>();
            tmp.transform.SetParent(rt, false);
            tmp.font = _font;
            tmp.fontSize = 40;
            tmp.text = text;
            tmp.textWrappingMode = TextWrappingModes.NoWrap;
            tmp.color = new Color(0.07f, 0.11f, 0.18f);
            tmp.alignment = TextAlignmentOptions.Center;
            Stretch(tmp.rectTransform);
            tmp.margin = new Vector4(16, 0, 16, 0);
            if (width <= 0) width = tmp.GetPreferredValues(text).x + 48;
            else
            {
                tmp.enableAutoSizing = true;
                tmp.fontSizeMax = 40;
                tmp.fontSizeMin = 20;
            }
            rt.pivot = new Vector2(0.5f, 0f);
            rt.sizeDelta = new Vector2(width, 68);
            rt.localScale = Vector3.one * 0.00042f;
            rt.localPosition = Vector3.zero;
            return rt;
        }

        public Material UnlitMat(string name, Color color, bool transparent = false)
        {
            if (_mats.TryGetValue(name, out var m)) return m;
            var path = $"{Dir}/Materials/{name}.mat";
            var shader = Shader.Find("Universal Render Pipeline/Unlit");
            m = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (m == null)
            {
                m = new Material(shader);
                AssetDatabase.CreateAsset(m, path);
            }
            m.shader = shader;
            m.SetColor("_BaseColor", color);
            if (transparent) Transparent(m);
            EditorUtility.SetDirty(m);
            _mats[name] = m;
            return m;
        }

        private static void Transparent(Material m)
        {
            m.SetFloat("_Surface", 1);
            m.SetFloat("_Blend", 0);
            m.SetFloat("_ZWrite", 0);
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = (int)UnityEngine.Rendering.RenderQueue.Transparent;
        }

        /// <summary>A soft shadow on the desk under an object, so it sits on the surface instead of floating.</summary>
        public Transform ContactShadow(Transform parent, Vector3 at, Vector2 size, float strength = 0.5f)
        {
            var key = "ContactShadow" + Mathf.RoundToInt(strength * 100);
            if (!_mats.TryGetValue(key, out var m))
            {
                Directory.CreateDirectory(Dir + "/Textures");
                var texPath = $"{Dir}/Textures/contact_shadow.png";
                if (!File.Exists(texPath))
                {
                    const int n = 256;
                    var tex = new Texture2D(n, n, TextureFormat.RGBA32, false);
                    for (var y = 0; y < n; y++)
                    for (var x = 0; x < n; x++)
                    {
                        var dx = Mathf.Max(0, Mathf.Abs(x - n / 2f + 0.5f) / (n / 2f) - 0.6f) / 0.4f;
                        var dy = Mathf.Max(0, Mathf.Abs(y - n / 2f + 0.5f) / (n / 2f) - 0.6f) / 0.4f;
                        var d = Mathf.Clamp01(Mathf.Sqrt(dx * dx + dy * dy));
                        tex.SetPixel(x, y, new Color(0, 0, 0, Mathf.Pow(1 - d, 2.2f)));
                    }
                    File.WriteAllBytes(texPath, tex.EncodeToPNG());
                    Object.DestroyImmediate(tex);
                    AssetDatabase.ImportAsset(texPath);
                    if (AssetImporter.GetAtPath(texPath) is TextureImporter imp)
                    {
                        imp.alphaIsTransparency = true;
                        imp.wrapMode = TextureWrapMode.Clamp;
                        imp.SaveAndReimport();
                    }
                }
                m = UnlitMat(key, new Color(0, 0, 0, strength), true);
                m.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(texPath));
                EditorUtility.SetDirty(m);
            }
            var q = Decal(parent, "ContactShadow", at + new Vector3(0, 0.0006f, 0), size * 1.3f, m);
            q.GetComponent<MeshRenderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return q;
        }

        // Raised keycaps over a keyboard texture: one rounded cap per key rectangle (in texture pixels), all
        // in one mesh, each showing its own legend from the texture.
        public Transform Keycaps(Transform parent, string name, Vector3 at, Vector2 plate, Vector2 texSize, IEnumerable<Rect> keys, float height, Material mat)
        {
            if (_meshes.TryGetValue(name, out var built)) return Place(built);
            var path = $"{Dir}/Meshes/{name}.asset";
            var verts = new List<Vector3>();
            var norms = new List<Vector3>();
            var uvs = new List<Vector2>();
            var tris = new List<int>();
            foreach (var k in keys)
            {
                var w = k.width / texSize.x * plate.x;
                var d = k.height / texSize.y * plate.y;
                var cx = ((k.x + k.width / 2) / texSize.x - 0.5f) * plate.x;
                var cz = (0.5f - (k.y + k.height / 2) / texSize.y) * plate.y;
                var cap = RoundBoxMesh(new Vector3(w * 0.95f, height, d * 0.95f), Mathf.Min(0.0015f, height * 0.35f), 3);
                var start = verts.Count;
                var cv = cap.vertices;
                var cn = cap.normals;
                for (var i = 0; i < cv.Length; i++)
                {
                    var v = cv[i];
                    if (v.y > 0) { v.x *= 0.9f; v.z *= 0.9f; }
                    v += new Vector3(cx, height / 2, cz);
                    verts.Add(v);
                    norms.Add(cn[i]);
                    uvs.Add(new Vector2(v.x / plate.x + 0.5f, v.z / plate.y + 0.5f));
                }
                foreach (var ti in cap.triangles) tris.Add(start + ti);
                Object.DestroyImmediate(cap);
            }
            var mesh = new Mesh { indexFormat = UnityEngine.Rendering.IndexFormat.UInt32, name = name };
            mesh.SetVertices(verts);
            mesh.SetNormals(norms);
            mesh.SetUVs(0, uvs);
            mesh.SetTriangles(tris, 0);
            mesh.RecalculateBounds();
            mesh.RecalculateTangents();
            Directory.CreateDirectory(Dir + "/Meshes");
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);
            _meshes[name] = mesh;
            return Place(mesh);

            Transform Place(Mesh m)
            {
                var go = new GameObject(name);
                go.transform.SetParent(parent, false);
                go.transform.localPosition = at;
                go.AddComponent<MeshFilter>().sharedMesh = m;
                go.AddComponent<MeshRenderer>().sharedMaterial = mat;
                return go.transform;
            }
        }

        private static void Stretch(RectTransform rt)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
        }

        /// <summary>A shallow grey tray with a rim, its target on the floor, and a name pin behind it.</summary>
        public Transform Tray(Transform parent, string name, Vector3 at, float w = 0.15f, float d = 0.15f)
        {
            var tray = Group(parent, name, at);
            var grey = Mat("Tray", new Color(0.55f, 0.6f, 0.66f), 0.2f, 0.35f);
            var rim = Mat("TrayRim", new Color(0.45f, 0.5f, 0.56f), 0.2f, 0.35f);
            const float h = 0.03f, t = 0.008f;
            Box(tray, "Floor", new Vector3(0, t / 2, 0), new Vector3(w, t, d), grey);
            Box(tray, "RimFront", new Vector3(0, h / 2, -d / 2 + t / 2), new Vector3(w, h, t), rim);
            Box(tray, "RimBack", new Vector3(0, h / 2, d / 2 - t / 2), new Vector3(w, h, t), rim);
            Box(tray, "RimLeft", new Vector3(-w / 2 + t / 2, h / 2, 0), new Vector3(t, h, d), rim);
            Box(tray, "RimRight", new Vector3(w / 2 - t / 2, h / 2, 0), new Vector3(t, h, d), rim);
            Group(tray, "Target", new Vector3(0, t, 0));
            var pin = Group(tray, "SciencePin", new Vector3(-w / 2 + 0.012f, 0, -d / 2 - 0.004f));
            Cylinder(pin, "Stalk", new Vector3(0, 0.022f, 0), new Vector3(0.0025f, 0.044f, 0.0025f), Mat("PinMetal", new Color(0.7f, 0.72f, 0.75f), 0.8f, 0.6f));
            var canvas = TagCanvas(pin, "", 260);
            canvas.localPosition = new Vector3(0, 0.044f, 0);
            canvas.gameObject.AddComponent<FaceViewer>();
            return tray;
        }

        // ---- the Observe timeline ------------------------------------------------------------

        private class Track
        {
            public readonly List<Keyframe>[] Pos = { new List<Keyframe>(), new List<Keyframe>(), new List<Keyframe>() };
            public readonly List<Keyframe>[] Scale = { new List<Keyframe>(), new List<Keyframe>(), new List<Keyframe>() };
            public readonly List<Keyframe>[] Rot = { new List<Keyframe>(), new List<Keyframe>(), new List<Keyframe>(), new List<Keyframe>() };
        }

        private readonly Dictionary<Transform, Track> _tracks = new Dictionary<Transform, Track>();

        private Track T(Transform t)
        {
            if (_tracks.TryGetValue(t, out var tr)) return tr;
            tr = new Track();
            _tracks[t] = tr;
            for (var i = 0; i < 3; i++)
            {
                tr.Pos[i].Add(new Keyframe(0, t.localPosition[i], 0, 0));
                tr.Scale[i].Add(new Keyframe(0, t.localScale[i], 0, 0));
            }
            var q = t.localRotation;
            for (var i = 0; i < 4; i++) tr.Rot[i].Add(new Keyframe(0, q[i], 0, 0));
            return tr;
        }

        public void Pos(Transform t, float time, Vector3 v)
        {
            var tr = T(t);
            for (var i = 0; i < 3; i++) tr.Pos[i].Add(new Keyframe(time, v[i], 0, 0));
        }

        public void Rot(Transform t, float time, Quaternion q)
        {
            var tr = T(t);
            var last = new Quaternion(tr.Rot[0].Last().value, tr.Rot[1].Last().value, tr.Rot[2].Last().value, tr.Rot[3].Last().value);
            if (Quaternion.Dot(last, q) < 0) q = new Quaternion(-q.x, -q.y, -q.z, -q.w);
            for (var i = 0; i < 4; i++) tr.Rot[i].Add(new Keyframe(time, q[i], 0, 0));
        }

        public void Scl(Transform t, float time, Vector3 v)
        {
            var tr = T(t);
            for (var i = 0; i < 3; i++) tr.Scale[i].Add(new Keyframe(time, v[i], 0, 0));
        }

        /// <summary>Holds at home, glides out by the offset, holds, glides home.</summary>
        public void Out(Transform t, float from, float to, Vector3 offset, float glide = 0.8f)
        {
            var home = t.localPosition;
            Pos(t, from, home);
            Pos(t, from + glide, home + offset);
            Pos(t, to - glide, home + offset);
            Pos(t, to, home);
        }

        /// <summary>A name card pops up (with a little overshoot) and later shrinks away.</summary>
        public void Show(string key, float from, float to)
        {
            var l = Labels[key];
            Scl(l, from, Vector3.zero);
            Scl(l, from + 0.35f, Vector3.one * 1.08f);
            Scl(l, from + 0.5f, Vector3.one);
            Scl(l, to - 0.3f, Vector3.one);
            Scl(l, to, Vector3.zero);
        }

        public void Pulse(Transform t, float at, float amount = 0.05f)
        {
            var s = t.localScale;
            Scl(t, at, s);
            Scl(t, at + 0.35f, s * (1 + amount));
            Scl(t, at + 0.7f, s);
        }

        /// <summary>A quick hop up and down, as a device "speaks".</summary>
        public void Hop(Transform t, float at, float height = 0.03f)
        {
            var home = t.localPosition;
            Pos(t, at, home);
            Pos(t, at + 0.25f, home + Vector3.up * height);
            Pos(t, at + 0.5f, home);
        }

        /// <summary>Turns the keyframes into one legacy clip on the Observe object, which the app replays.</summary>
        public AnimationClip FinishTimeline()
        {
            var length = (float)Timings["observeLength"];
            var clip = new AnimationClip { name = ObserveName, legacy = true, wrapMode = WrapMode.Once };
            var axes = new[] { "x", "y", "z" };
            foreach (var pair in _tracks)
            {
                var path = AnimationUtility.CalculateTransformPath(pair.Key, Observe);
                for (var i = 0; i < 3; i++)
                {
                    clip.SetCurve(path, typeof(Transform), "localPosition." + axes[i], Curve(pair.Value.Pos[i], length));
                    clip.SetCurve(path, typeof(Transform), "localScale." + axes[i], Curve(pair.Value.Scale[i], length));
                }
                if (pair.Value.Rot[0].Count > 1)
                {
                    var comps = new[] { "x", "y", "z", "w" };
                    for (var i = 0; i < 4; i++)
                        clip.SetCurve(path, typeof(Transform), "localRotation." + comps[i], Curve(pair.Value.Rot[i], length));
                }
            }
            var clipPath = $"{Dir}/{ObserveName}.anim";
            AssetDatabase.DeleteAsset(clipPath);
            AssetDatabase.CreateAsset(clip, clipPath);
            var anim = Observe.gameObject.AddComponent<Animation>();
            anim.clip = clip;
            anim.AddClip(clip, clip.name);
            anim.playAutomatically = true;
            return clip;
        }

        private static AnimationCurve Curve(List<Keyframe> keys, float length)
        {
            var sorted = keys.OrderBy(k => k.time).GroupBy(k => Mathf.Round(k.time * 1000)).Select(g => g.Last()).ToList();
            if (sorted[sorted.Count - 1].time < length) sorted.Add(new Keyframe(length, sorted[sorted.Count - 1].value, 0, 0));
            return new AnimationCurve(sorted.ToArray());
        }

        // ---- Explore: parts onto trays ----------------------------------------------------------

        private readonly JArray _dragItems = new JArray(), _scienceObjects = new JArray(), _trays = new JArray();

        /// <summary>Makes a part draggable onto its tray, voicing what it is while held.</summary>
        public void Link(Transform part, Transform tray, string key)
        {
            FitCollider(part);
            var info = Parts.First(p => (string)p["key"] == key);
            var prefix = (string)Content["audioPrefix"] ?? "ICT_Computer";
            _dragItems.Add(new JObject
            {
                ["path"] = PathOf(part), ["isDraggable"] = true, ["dragPath"] = PathOf(part), ["targetPath"] = PathOf(tray.Find("Target")),
                ["useLocalTransform"] = true, ["returnWhenOver"] = false, ["returnDuration"] = 0.3, ["targetTweenDuration"] = 0.35,
                ["holdClip"] = $"{prefix}_Explore_{key}",
                ["holdCaption"] = $"<size=+10><b>{info["name"]}: </b></size><br>{info["text"]}",
                ["holdCaptionMinimumDuration"] = 0,
            });
            _scienceObjects.Add(new JObject { ["path"] = PathOf(part), ["name"] = info["name"], ["trayPath"] = PathOf(tray), ["hasTransitionAnimation"] = false });
            _trays.Add(new JObject
            {
                ["path"] = PathOf(tray), ["labelPath"] = PathOf(tray.Find("SciencePin/Canvas/Text (TMP)")), ["targetPath"] = PathOf(tray.Find("Target")),
            });
        }

        /// <summary>Makes a part draggable into its place (a slot or a port), voicing how to handle it while held.</summary>
        public void LinkTo(Transform part, Transform target, Transform tray, string key, float snapRadius = 0, string fits = null,
            float lift = 0, Vector3? approach = null)
        {
            FitCollider(part);
            var info = Parts.First(p => (string)p["key"] == key);
            var prefix = (string)Content["audioPrefix"];
            _dragItems.Add(new JObject
            {
                ["path"] = PathOf(part), ["isDraggable"] = true, ["dragPath"] = PathOf(part), ["targetPath"] = PathOf(target),
                ["useLocalTransform"] = true, ["returnWhenOver"] = false, ["returnDuration"] = 0.35, ["targetTweenDuration"] = 0.45,
                ["holdClip"] = $"{prefix}_Explore_{key}",
                ["holdCaption"] = $"<size=+10><b>{info["name"]}: </b></size><br>{info["text"]}",
                ["holdCaptionMinimumDuration"] = 0,
                ["snapRadius"] = snapRadius,
                ["fits"] = fits,
                ["lift"] = lift,
                ["approach"] = approach.HasValue ? new JObject { ["x"] = approach.Value.x, ["y"] = approach.Value.y, ["z"] = approach.Value.z } : null,
            });
            _scienceObjects.Add(new JObject { ["path"] = PathOf(part), ["name"] = info["name"], ["trayPath"] = tray != null ? PathOf(tray) : null, ["hasTransitionAnimation"] = false });
            if (tray != null)
                _trays.Add(new JObject
                {
                    ["path"] = PathOf(tray), ["labelPath"] = PathOf(tray.Find("SciencePin/Canvas/Text (TMP)")), ["targetPath"] = PathOf(target),
                });
        }

        public readonly List<(string id, string title, string description, Transform root)> ExploreSteps = new List<(string, string, string, Transform)>();

        public string PathOf(Transform t)
        {
            var parts = new List<string>();
            for (var n = t; n != null; n = n.parent)
            {
                parts.Add(n.name);
                if (n == Root) break;
            }
            parts.Reverse();
            return string.Join("/", parts);
        }

        // ---- finishing: audio, manifest, thumbnail, bundle -------------------------------------

        /// <summary>Saves the scene with its narration and manifest, renders the thumbnail, and builds the bundle.</summary>
        public Transform ThumbnailSubject;
        public int ThumbnailSize = 576;

        public void Finish(AnimationClip observeClip, Vector3 thumbCamera, Vector3 thumbLook, float thumbFov = 26)
        {
            var clips = new List<string>();
            var holder = Group(Root, "Audio", Vector3.zero);
            foreach (var file in Directory.GetFiles(Dir + "/Audio", "*.wav"))
            {
                var clip = AssetDatabase.LoadAssetAtPath<AudioClip>(file.Replace('\\', '/'));
                if (clip == null) continue;
                var src = new GameObject(clip.name).AddComponent<AudioSource>();
                src.transform.SetParent(holder, false);
                src.clip = clip;
                src.playOnAwake = false;
                src.enabled = false;
                clips.Add(clip.name);
            }
            var manifest = Manifest(clips, observeClip.name);
            Root.gameObject.AddComponent<ActivityManifestAsset>().json = manifest.ToString(Newtonsoft.Json.Formatting.None);
            File.WriteAllText(Path.Combine(Source, "activity.json"), manifest.ToString());

            var scene = UnityEngine.SceneManagement.SceneManager.GetActiveScene();
            EditorSceneManager.SaveScene(scene, ScenePath);
            RenderThumbnail(thumbCamera, thumbLook, thumbFov);
            EditorSceneManager.SaveScene(scene, ScenePath);
            var version = int.TryParse(System.Environment.GetEnvironmentVariable("ELIMUAR_BUNDLE_VERSION"), out var v) ? v : 1;
            var name = $"{Key}_android_v{version:000}.bundle";
            Directory.CreateDirectory("Builds/Bundles");
            BuildPipeline.BuildAssetBundles("Builds/Bundles",
                new[] { new AssetBundleBuild { assetBundleName = name, assetNames = new[] { ScenePath } } },
                BuildAssetBundleOptions.ChunkBasedCompression, BuildTarget.Android);
            Debug.Log($"[ElimuAR] bundle Builds/Bundles/{name}");
        }

        private JObject Manifest(List<string> clips, string animation)
        {
            JObject Step(string id, string kind, string title, string description) => new JObject
            {
                ["id"] = id, ["kind"] = kind, ["title"] = title, ["description"] = description, ["imageName"] = null,
                ["autoplayVO"] = true, ["voClip"] = null, ["captions"] = new JArray(), ["buttons"] = new JArray(),
                ["confirmMoveOn"] = false,
                ["confirm"] = new JObject { ["title"] = "Ready to Move On?", ["content"] = "Are you ready to move to the next exercise?", ["confirm"] = "Continue to next exercise", ["cancel"] = "Cancel" },
                ["countdown"] = new JObject { ["duration"] = 5, ["text"] = "Moving on in..." },
                ["objectPaths"] = new JArray(),
            };

            var observe = Step(Folder + "Observe", "step", "Observe", (string)Content["observe"]["description"]);
            observe["voClip"] = (string)Timings["observeClip"];
            var captions = new JArray(Timings["captions"].Select(c => new JObject { ["text"] = c["text"], ["duration"] = c["duration"] }));
            captions.Add(new JObject { ["text"] = "Select Next to continue.", ["duration"] = -1 });
            observe["captions"] = captions;
            observe["buttons"] = new JArray(new JObject { ["id"] = "observe_replay", ["text"] = "Replay", ["active"] = true, ["enabled"] = true });
            observe["objectPaths"] = new JArray(ObserveName);

            JObject ExploreStep(string id, string title, string description, string root, bool last)
            {
                var e = Step(Folder + id, "step", title, description);
                e["buttons"] = new JArray(new JObject { ["id"] = "explore_reset", ["text"] = "Reset", ["active"] = true, ["enabled"] = true });
                e["objectPaths"] = new JArray(root);
                e["confirmMoveOn"] = true;
                e["confirm"] = last
                    ? new JObject { ["title"] = "Ready to Move On?", ["content"] = "Are you ready to show what you know?", ["confirm"] = "I'm Ready!", ["cancel"] = "Cancel" }
                    : new JObject { ["title"] = "Ready to Move On?", ["content"] = "Are you ready for the next exercise?", ["confirm"] = "Continue to next exercise", ["cancel"] = "Cancel" };
                return e;
            }
            var exploreSteps = new JArray();
            if (ExploreSteps.Count == 0)
                exploreSteps.Add(ExploreStep("Explore", "Explore", (string)Content["explore"]["description"], ExploreName, true));
            for (var i = 0; i < ExploreSteps.Count; i++)
                exploreSteps.Add(ExploreStep(ExploreSteps[i].id, ExploreSteps[i].title, ExploreSteps[i].description, ExploreSteps[i].root.name, i == ExploreSteps.Count - 1));

            var questions = new JArray();
            var n = 0;
            foreach (var item in Content["questions"]["items"])
            {
                var q = Step($"{Folder}Evaluate{++n:00}", "question", "Question", (string)item["q"]);
                q["question"] = new JObject
                {
                    ["randomizeAnswers"] = true,
                    ["correctHeader"] = "<b>Great job, ::ANSWER:: is correct!</b>",
                    ["incorrectHeader"] = "<b>The correct answer is ::ANSWER::.</b>",
                    ["correctFeedback"] = "", ["incorrectFeedback"] = "",
                    ["answers"] = new JArray(item["answers"].Select((a, i) => new JObject { ["text"] = a, ["correct"] = i == 0, ["feedback"] = "", ["iconName"] = null })),
                };
                questions.Add(q);
            }

            var summary = Step(Folder + "Results", "step", "Summary", (string)Content["summary"]);
            return new JObject
            {
                ["format"] = "elimuar-activity/1",
                ["scenePath"] = ScenePath,
                ["rootPath"] = RootName,
                ["settings"] = new JObject { ["occlusion"] = false, ["showDesk"] = true, ["deskOffset"] = new JObject { ["x"] = 0, ["y"] = 0, ["z"] = 0 } },
                ["sections"] = new JArray(
                    new JObject { ["kind"] = "observe", ["section"] = 11, ["randomize"] = false, ["maxSteps"] = -1, ["steps"] = new JArray(observe) },
                    new JObject { ["kind"] = "explore", ["section"] = 12, ["randomize"] = false, ["maxSteps"] = -1, ["steps"] = exploreSteps },
                    new JObject { ["kind"] = "question", ["section"] = 13, ["randomize"] = true, ["maxSteps"] = (int)Content["questions"]["maxSteps"], ["steps"] = questions },
                    new JObject { ["kind"] = "summary", ["section"] = 14, ["randomize"] = false, ["maxSteps"] = -1, ["steps"] = new JArray(summary) }),
                ["dragItems"] = _dragItems,
                ["scienceObjects"] = _scienceObjects,
                ["trays"] = _trays,
                ["faders"] = new JArray(),
                ["intro"] = new JObject { ["path"] = RootName + "/" + ObserveName, ["replayId"] = "observe_replay" },
                ["animator"] = new JObject { ["path"] = RootName + "/" + ObserveName, ["startState"] = "" },
                ["exploreRoots"] = ExploreSteps.Count == 0
                    ? new JArray(RootName + "/" + ExploreName)
                    : new JArray(ExploreSteps.Select(e => RootName + "/" + e.root.name)),
                ["audioClips"] = new JArray(clips.OrderBy(c => c)),
                ["animationClips"] = new JArray(animation),
            };
        }

        /// <summary>A picture of the Explore model (without trays) on white, for the library and the portal.</summary>
        private void RenderThumbnail(Vector3 cameraAt, Vector3 lookAt, float fov)
        {
            var asyncShaders = ShaderUtil.allowAsyncCompilation;
            ShaderUtil.allowAsyncCompilation = false;
            var subject = ThumbnailSubject != null ? ThumbnailSubject : Explore;
            var shown = new List<GameObject>();
            foreach (Transform child in Root)
                if (child.gameObject.activeSelf) { shown.Add(child.gameObject); child.gameObject.SetActive(false); }
            subject.gameObject.SetActive(true);
            var trays = subject.Find("Trays");
            if (trays != null) trays.gameObject.SetActive(false);
            var camGo = new GameObject("ThumbCamera");
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(1, 1, 1, 0);
            cam.fieldOfView = fov;
            cam.transform.position = cameraAt;
            cam.transform.LookAt(lookAt);
            var size = ThumbnailSize;
            var rt = new RenderTexture(size, size, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            cam.targetTexture = rt;
            cam.Render();
            cam.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, size, size), 0, 0);
            tex.Apply();
            RenderTexture.active = null;
            Directory.CreateDirectory("Builds/Bundles");
            File.WriteAllBytes($"Builds/Bundles/ict-activity-thumbnail-{Key}.png", tex.EncodeToPNG());
            cam.targetTexture = null;
            Object.DestroyImmediate(rt);
            Object.DestroyImmediate(camGo);
            if (trays != null) trays.gameObject.SetActive(true);
            subject.gameObject.SetActive(false);
            foreach (var go in shown) go.SetActive(true);
            ShaderUtil.allowAsyncCompilation = asyncShaders;
        }
    }
}
