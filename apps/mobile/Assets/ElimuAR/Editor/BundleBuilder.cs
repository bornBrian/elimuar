using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace ElimuAR.Editor
{
    // Makes an activity bundle (the file the portal uploads and the phone downloads) out of a Unity scene.
    public static class BundleBuilder
    {
        private const string OutDir = "Builds/Bundles";

        [MenuItem("ElimuAR/Build Activity Bundle")]
        public static void BuildOpenScene()
        {
            var scene = EditorSceneManager.GetActiveScene();
            if (string.IsNullOrEmpty(scene.path))
            {
                EditorUtility.DisplayDialog("Build Activity Bundle", "Save the scene first.", "OK");
                return;
            }
            if (scene.isDirty) EditorSceneManager.SaveScene(scene);
            var version = EditorPrefs.GetInt("ElimuAR.bundleVersion." + scene.name, 0) + 1;
            var file = Build(scene.path, version);
            EditorPrefs.SetInt("ElimuAR.bundleVersion." + scene.name, version);
            EditorUtility.RevealInFinder(file);
            Debug.Log($"[ElimuAR] built {file}. Upload it in the portal: AR Activities → Upload.");
        }

        public static void BuildFromCommandLine()
        {
            var args = System.Environment.GetCommandLineArgs();
            string scenePath = null;
            var version = 1;
            for (var i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "-scene") scenePath = args[i + 1];
                if (args[i] == "-bundleVersion") int.TryParse(args[i + 1], out version);
            }
            if (string.IsNullOrEmpty(scenePath) || !File.Exists(scenePath))
            {
                Debug.LogError("[ElimuAR] pass -scene Assets/…/name.unity");
                EditorApplication.Exit(1);
                return;
            }
            Build(scenePath, version);
        }

        private static string Build(string scenePath, int version)
        {
            var name = Path.GetFileNameWithoutExtension(scenePath).ToLowerInvariant();
            var bundleName = $"{name}_android_v{version:000}.bundle";
            Directory.CreateDirectory(OutDir);
            var build = new AssetBundleBuild { assetBundleName = bundleName, assetNames = new[] { scenePath } };
            BuildPipeline.BuildAssetBundles(OutDir, new[] { build }, BuildAssetBundleOptions.ChunkBasedCompression, BuildTarget.Android);
            var file = Path.GetFullPath(Path.Combine(OutDir, bundleName));
            Debug.Log($"[ElimuAR] bundle {file} ({new FileInfo(file).Length / 1048576f:0.0} MB)");
            return file;
        }
    }
}
