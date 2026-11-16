using System;
using System.IO;
using System.Linq;
using TMPro;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.Management;

namespace ElimuAR.Editor
{
    // Sets the project up and builds the app, so it can be done from the command line with no editor window.
    public static class ElimuBuild
    {
        private const string Root = "Assets/ElimuAR";
        private const string Generated = Root + "/Generated";
        private const string FontsOut = Root + "/Resources/Fonts";
        private const string MaterialsOut = Root + "/Resources/Materials";
        private const string ScenePath = Root + "/Scenes/Main.unity";
        public const string PackageId = "com.elimuar.app";

        [MenuItem("ElimuAR/Setup Project")]
        public static void Setup()
        {
            ImportTmpEssentials();
            Directory.CreateDirectory(Generated);
            Directory.CreateDirectory(FontsOut);
            Directory.CreateDirectory(MaterialsOut);
            AssetDatabase.Refresh();
            Fonts();
            RenderPipeline();
            Materials();
            Scene();
            Xr();
            Player();
            AssetDatabase.SaveAssets();
            Debug.Log("[ElimuAR] project set up");
        }

        // ---- text ----------------------------------------------------------------------

        private static void ImportTmpEssentials()
        {
            if (AssetDatabase.FindAssets("t:TMP_Settings").Length > 0) return;
            var package = Directory.GetFiles("Library/PackageCache", "TMP Essential Resources.unitypackage", SearchOption.AllDirectories)
                .FirstOrDefault();
            if (package == null)
            {
                Debug.LogError("[ElimuAR] TMP Essential Resources.unitypackage not found in the package cache");
                return;
            }
            AssetDatabase.ImportPackage(package, false);
            AssetDatabase.Refresh();
            Debug.Log("[ElimuAR] imported TMP essential resources");
        }

        private static void Fonts()
        {
            foreach (var weight in new[] { "Regular", "Medium", "SemiBold", "Bold" })
            {
                var target = $"{FontsOut}/Montserrat-{weight} SDF.asset";
                if (AssetDatabase.LoadAssetAtPath<TMP_FontAsset>(target) != null) continue;
                var font = AssetDatabase.LoadAssetAtPath<Font>($"{Root}/Fonts/Montserrat-{weight}.ttf");
                if (font == null) { Debug.LogError("[ElimuAR] missing font " + weight); continue; }
                var asset = TMP_FontAsset.CreateFontAsset(font, 90, 9, UnityEngine.TextCore.LowLevel.GlyphRenderMode.SDFAA, 1024, 1024,
                    AtlasPopulationMode.Dynamic, true);
                asset.name = $"Montserrat-{weight} SDF";
                AssetDatabase.CreateAsset(asset, target);
                asset.material.name = asset.name + " Material";
                AssetDatabase.AddObjectToAsset(asset.material, asset);
                asset.atlasTextures[0].name = asset.name + " Atlas";
                AssetDatabase.AddObjectToAsset(asset.atlasTextures[0], asset);
                EditorUtility.SetDirty(asset);
            }
            AssetDatabase.SaveAssets();
            var medium = AssetDatabase.LoadAssetAtPath<TMP_FontAsset>($"{FontsOut}/Montserrat-Medium SDF.asset");
            var settings = TMP_Settings.instance;
            if (settings != null && medium != null)
            {
                var so = new SerializedObject(settings);
                so.FindProperty("m_defaultFontAsset").objectReferenceValue = medium;
                so.ApplyModifiedPropertiesWithoutUndo();
            }
        }

        // ---- rendering -------------------------------------------------------------------

        private static void RenderPipeline()
        {
            var assetPath = Generated + "/ElimuAR-URP.asset";
            var rendererPath = Generated + "/ElimuAR-URP-Renderer.asset";
            var data = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rendererPath);
            if (data == null)
            {
                data = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(data, rendererPath);
            }
            if (!data.rendererFeatures.OfType<ARBackgroundRendererFeature>().Any())
            {
                var feature = ScriptableObject.CreateInstance<ARBackgroundRendererFeature>();
                feature.name = "ARBackgroundRendererFeature";
                AssetDatabase.AddObjectToAsset(feature, data);
                data.rendererFeatures.Add(feature);
                var so = new SerializedObject(data);
                var map = so.FindProperty("m_RendererFeatureMap");
                if (map != null)
                {
                    AssetDatabase.TryGetGUIDAndLocalFileIdentifier(feature, out _, out long id);
                    map.arraySize++;
                    map.GetArrayElementAtIndex(map.arraySize - 1).longValue = id;
                    so.ApplyModifiedPropertiesWithoutUndo();
                }
                EditorUtility.SetDirty(data);
            }
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(assetPath);
            if (pipeline == null)
            {
                pipeline = UniversalRenderPipelineAsset.Create(data);
                AssetDatabase.CreateAsset(pipeline, assetPath);
            }
            pipeline.supportsHDR = false;
            pipeline.msaaSampleCount = 4;
            pipeline.shadowDistance = 6f;
            EditorUtility.SetDirty(pipeline);
            GraphicsSettings.defaultRenderPipeline = pipeline;
            for (var i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }
            AssetDatabase.SaveAssets();
        }

        private static Material MakeMaterial(string name, string shader, Color color, bool transparent, Texture2D tex = null)
        {
            var path = $"{MaterialsOut}/{name}.mat";
            var m = AssetDatabase.LoadAssetAtPath<Material>(path);
            var s = Shader.Find(shader);
            if (s == null) { Debug.LogError("[ElimuAR] shader not found: " + shader); return null; }
            if (m == null)
            {
                m = new Material(s) { name = name };
                AssetDatabase.CreateAsset(m, path);
            }
            m.shader = s;
            m.SetColor("_BaseColor", color);
            if (tex != null) m.SetTexture("_BaseMap", tex);
            if (transparent)
            {
                m.SetFloat("_Surface", 1);
                m.SetFloat("_Blend", 0);
                m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                m.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                m.SetFloat("_ZWrite", 0);
                m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                m.renderQueue = (int)RenderQueue.Transparent;
                m.SetOverrideTag("RenderType", "Transparent");
            }
            m.SetFloat("_Cull", 0);
            EditorUtility.SetDirty(m);
            return m;
        }

        private static Texture2D SaveTexture(string name, Texture2D tex)
        {
            var path = $"{Generated}/{name}.png";
            File.WriteAllBytes(path, tex.EncodeToPNG());
            AssetDatabase.ImportAsset(path);
            var importer = (TextureImporter)AssetImporter.GetAtPath(path);
            importer.alphaIsTransparency = true;
            importer.mipmapEnabled = true;
            importer.wrapMode = TextureWrapMode.Clamp;
            importer.SaveAndReimport();
            return AssetDatabase.LoadAssetAtPath<Texture2D>(path);
        }

        /// <summary>Thin white outlines: the activity space's two nested rectangles.</summary>
        private static Texture2D MatTexture()
        {
            const int n = 512;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false);
            var px = new Color32[n * n];
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                bool Edge(int inset, int w) =>
                    (x >= inset && x < n - inset && y >= inset && y < n - inset) &&
                    (x < inset + w || x >= n - inset - w || y < inset + w || y >= n - inset - w);
                var on = Edge(2, 3) || Edge(78, 3);
                px[y * n + x] = on ? new Color32(255, 255, 255, 210) : new Color32(255, 255, 255, 0);
            }
            tex.SetPixels32(px);
            tex.Apply();
            return tex;
        }

        /// <summary>The setup reticle: a square outline with a white anchor tile in the middle.</summary>
        private static Texture2D ReticleTexture()
        {
            const int n = 256;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false);
            var px = new Color32[n * n];
            var anchor = AnchorMask(70);
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var c = new Color32(255, 255, 255, 0);
                var outline = x < 9 || x >= n - 9 || y < 9 || y >= n - 9;
                var tile = x >= 88 && x < 168 && y >= 88 && y < 168;
                if (outline) c = new Color32(255, 255, 255, 255);
                else if (tile)
                {
                    var ax = x - 93; var ay = y - 93;
                    var ink = ax >= 0 && ay >= 0 && ax < 70 && ay < 70 && anchor[ay * 70 + ax];
                    c = ink ? new Color32(40, 40, 40, 255) : new Color32(255, 255, 255, 255);
                }
                else c = new Color32(255, 255, 255, 28);
                px[y * n + x] = c;
            }
            tex.SetPixels32(px);
            tex.Apply();
            return tex;
        }

        private static bool[] AnchorMask(int n)
        {
            var mask = new bool[n * n];
            float S(float v) => v * n / 24f;
            for (var y = 0; y < n; y++)
            for (var x = 0; x < n; x++)
            {
                var gx = x * 24f / n; var gy = 24 - y * 24f / n;
                var ring = Mathf.Abs(Vector2.Distance(new Vector2(gx, gy), new Vector2(12, 4.5f)) - 2f) < 0.9f;
                var shaft = Mathf.Abs(gx - 12) < 0.9f && gy > 6 && gy < 21;
                var bar = Mathf.Abs(gy - 10) < 0.9f && gx > 8 && gx < 16;
                var d = Vector2.Distance(new Vector2(gx, gy), new Vector2(12, 13));
                var arc = Mathf.Abs(d - 8) < 0.9f && gy > 15;
                mask[y * n + x] = ring || shaft || bar || arc;
            }
            return mask;
        }

        private static void Materials()
        {
            const string unlit = "Universal Render Pipeline/Unlit";
            const string lit = "Universal Render Pipeline/Lit";
            MakeMaterial("PlaneWash", unlit, new Color(1, 1, 1, 0.22f), true);
            MakeMaterial("PlaneLine", unlit, new Color(1, 1, 1, 0.75f), true);
            MakeMaterial("Mat", unlit, Color.white, true, SaveTexture("mat", MatTexture()));
            MakeMaterial("Shadow", unlit, new Color(0, 0, 0, 0.25f), true);
            MakeMaterial("Reticle", unlit, Color.white, true, SaveTexture("reticle", ReticleTexture()));
            MakeMaterial("Ink", unlit, new Color(0.12f, 0.71f, 0.23f, 1), false);
            MakeMaterial("Lit", lit, Color.white, false);
            MakeMaterial("Unlit", unlit, Color.white, false);
            MakeMaterial("LitTransparent", lit, Color.white, true);
            ShaderVariants();
            AssetDatabase.SaveAssets();
        }

        // One material per shader + keyword set the activity bundles use (bundle-shader-variants.json, read
        // from the bundles).
        private static void ShaderVariants()
        {
            var json = Root + "/Editor/bundle-shader-variants.json";
            if (!File.Exists(json)) return;
            var dir = Root + "/Resources/ShaderVariants";
            Directory.CreateDirectory(dir);
            var list = Newtonsoft.Json.Linq.JArray.Parse(File.ReadAllText(json));
            var i = 0;
            foreach (var v in list)
            {
                var shader = Shader.Find((string)v["shader"]);
                if (shader == null) { Debug.LogWarning("[ElimuAR] no shader " + v["shader"]); continue; }
                var path = $"{dir}/Variant{i++:00}.mat";
                var m = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (m == null) { m = new Material(shader); AssetDatabase.CreateAsset(m, path); }
                m.shader = shader;
                m.shaderKeywords = new string[0];
                foreach (var k in v["keywords"]) m.EnableKeyword((string)k);
                if ((float)v["surface"] > 0.5f && m.HasProperty("_Surface")) m.SetFloat("_Surface", 1);
                var q = (int)v["renderQueue"];
                if (q > 0) m.renderQueue = q;
                EditorUtility.SetDirty(m);
            }
            Debug.Log($"[ElimuAR] {i} shader variant materials");
        }

        // ---- scene, XR, player ---------------------------------------------------------------

        private static void Scene()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            if (!File.Exists(ScenePath))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                var light = new GameObject("Directional Light").AddComponent<Light>();
                light.type = LightType.Directional;
                light.intensity = 1.1f;
                light.shadows = LightShadows.Soft;
                light.transform.rotation = Quaternion.Euler(50, -30, 0);
                RenderSettings.ambientMode = AmbientMode.Trilight;
                RenderSettings.ambientSkyColor = new Color(0.82f, 0.82f, 0.84f);
                RenderSettings.ambientEquatorColor = new Color(0.62f, 0.62f, 0.62f);
                RenderSettings.ambientGroundColor = new Color(0.38f, 0.38f, 0.38f);
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        private static void Xr()
        {
            if (!EditorBuildSettings.TryGetConfigObject(XRGeneralSettings.k_SettingsKey, out XRGeneralSettingsPerBuildTarget perTarget))
            {
                Directory.CreateDirectory("Assets/XR");
                perTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(perTarget, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, perTarget, true);
            }
            if (!perTarget.HasManagerSettingsForBuildTarget(BuildTargetGroup.Android))
                perTarget.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.Android);
            var general = perTarget.SettingsForBuildTarget(BuildTargetGroup.Android);
            general.InitManagerOnStart = true;
            if (general.AssignedSettings == null)
            {
                var manager = ScriptableObject.CreateInstance<XRManagerSettings>();
                AssetDatabase.AddObjectToAsset(manager, perTarget);
                general.AssignedSettings = manager;
            }
            XRPackageMetadataStore.AssignLoader(general.AssignedSettings, "UnityEngine.XR.ARCore.ARCoreLoader", BuildTargetGroup.Android);
            EditorUtility.SetDirty(perTarget);
            EditorUtility.SetDirty(general);

            var arcore = UnityEditor.XR.ARCore.ARCoreSettings.GetOrCreateSettings();
            arcore.requirement = UnityEditor.XR.ARCore.ARCoreSettings.Requirement.Required;
            arcore.depth = UnityEditor.XR.ARCore.ARCoreSettings.Requirement.Optional;
            EditorUtility.SetDirty(arcore);
            AssetDatabase.SaveAssets();
        }

        private static void Player()
        {
            PlayerSettings.companyName = "ElimuAR";
            PlayerSettings.productName = "ElimuAR";
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Android, PackageId);
            PlayerSettings.bundleVersion = "1.0.0";
            PlayerSettings.Android.bundleVersionCode = Math.Max(1, PlayerSettings.Android.bundleVersionCode);
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel26;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.Android.forceInternetPermission = true;
            PlayerSettings.insecureHttpOption = InsecureHttpOption.AlwaysAllowed;
            PlayerSettings.stripEngineCode = false;
            PlayerSettings.SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget.Android, ManagedStrippingLevel.Minimal);
            PlayerSettings.Android.renderOutsideSafeArea = true;
            PlayerSettings.runInBackground = true;
            PlayerSettings.SplashScreen.showUnityLogo = false;
            PlayerSettings.SplashScreen.backgroundColor = new Color(0.9f, 0.9f, 0.9f);

            // Legacy input as well as the Input System: touches are read with Input.GetTouch.
            var projectSettings = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset").FirstOrDefault();
            if (projectSettings != null)
            {
                var so = new SerializedObject(projectSettings);
                var handler = so.FindProperty("activeInputHandler");
                if (handler != null) { handler.intValue = 2; so.ApplyModifiedPropertiesWithoutUndo(); }
            }

            // The launcher icon is ElimuAR's own mark (Branding/app-icon.png) when present.
            var icon = AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "/Branding/app-icon.png") ?? SaveTexture("icon", IconTexture(512));
            var kinds = PlayerSettings.GetSupportedIconKinds(UnityEditor.Build.NamedBuildTarget.Android);
            foreach (var kind in kinds)
            {
                var icons = PlayerSettings.GetPlatformIcons(UnityEditor.Build.NamedBuildTarget.Android, kind);
                foreach (var i in icons)
                {
                    var layers = new Texture2D[Mathf.Max(1, i.maxLayerCount)];
                    for (var l = 0; l < layers.Length; l++) layers[l] = icon;
                    i.SetTextures(layers);
                }
                PlayerSettings.SetPlatformIcons(UnityEditor.Build.NamedBuildTarget.Android, kind, icons);
            }

            File.WriteAllText(Root + "/link.xml",
                "<linker>\n  <assembly fullname=\"UnityEngine\" preserve=\"all\"/>\n  <assembly fullname=\"UnityEngine.UI\" preserve=\"all\"/>\n" +
                "  <assembly fullname=\"Unity.TextMeshPro\" preserve=\"all\"/>\n  <assembly fullname=\"Unity.RenderPipelines.Universal.Runtime\" preserve=\"all\"/>\n" +
                "  <assembly fullname=\"Unity.XR.ARFoundation\" preserve=\"all\"/>\n  <assembly fullname=\"Newtonsoft.Json\" preserve=\"all\"/>\n</linker>\n");
            AssetDatabase.ImportAsset(Root + "/link.xml");
        }

        /// <summary>The launcher icon: the ElimuAR green block with "Elimu" over "AR".</summary>
        private static Texture2D IconTexture(int n)
        {
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false);
            var green = new Color32(0x1E, 0xB5, 0x3A, 255);
            var px = Enumerable.Repeat(green, n * n).ToArray();
            // Block letters drawn as strokes on a 5x7 grid per glyph.
            string[] e = { "11111", "10000", "10000", "11110", "10000", "10000", "11111" };
            string[] l = { "10000", "10000", "10000", "10000", "10000", "10000", "11111" };
            string[] i = { "1", "0", "1", "1", "1", "1", "1" };
            string[] m = { "00000", "00000", "11011", "10101", "10101", "10101", "10101" };
            string[] u = { "00000", "00000", "10001", "10001", "10001", "10011", "01101" };
            string[] a = { "01110", "10001", "10001", "11111", "10001", "10001", "10001" };
            string[] r = { "11110", "10001", "10001", "11110", "10100", "10010", "10001" };
            void Word(string[][] glyphs, int x0, int y0, int cell)
            {
                var x = x0;
                foreach (var g in glyphs)
                {
                    for (var gy = 0; gy < 7; gy++)
                    for (var gx = 0; gx < g[gy].Length; gx++)
                        if (g[gy][gx] == '1')
                            for (var py = 0; py < cell; py++)
                            for (var pxl = 0; pxl < cell; pxl++)
                            {
                                var X = x + gx * cell + pxl;
                                var Y = n - 1 - (y0 + gy * cell + py);
                                if (X >= 0 && X < n && Y >= 0 && Y < n) px[Y * n + X] = new Color32(255, 255, 255, 255);
                            }
                    x += (g[0].Length + 1) * cell;
                }
            }
            var c = n / 34;
            Word(new[] { e, l, i, m, u }, n / 9, n / 6, c);
            Word(new[] { a, r }, n / 9, n / 6 + 9 * c, c + c / 2);
            tex.SetPixels32(px);
            tex.Apply();
            return tex;
        }

        // ---- build --------------------------------------------------------------------------------

        [MenuItem("ElimuAR/Build Android APK")]
        public static void BuildAndroid()
        {
            if (EditorUserBuildSettings.activeBuildTarget != BuildTarget.Android)
                EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            EditorUserBuildSettings.buildAppBundle = false;
            // IL2CPP converts on every core by default; on this 7 GB laptop that
            // runs Windows out of commit ("Insufficient quota"), so cap it.
            PlayerSettings.SetAdditionalIl2CppArgs("--jobs=4");
            Directory.CreateDirectory("Builds");
            var output = Path.GetFullPath("Builds/ElimuAR.apk");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = output,
                target = BuildTarget.Android,
                options = BuildOptions.None,
            });
            if (report.summary.result != BuildResult.Succeeded)
            {
                Debug.LogError($"[ElimuAR] build failed: {report.summary.result}, {report.summary.totalErrors} error(s)");
                if (Application.isBatchMode) EditorApplication.Exit(1);
                return;
            }
            var web = Path.GetFullPath("../web/public/downloads/elimuar.apk");
            Directory.CreateDirectory(Path.GetDirectoryName(web));
            File.Copy(output, web, true);
            Debug.Log($"[ElimuAR] built {output} ({report.summary.totalSize / 1048576f:0.0} MB) and copied it to {web}");
        }
    }
}
