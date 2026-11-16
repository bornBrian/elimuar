using System;
using System.IO;
using UnityEngine;

namespace ElimuAR
{
    /// <summary>Saves a photo of the AR view to the device's gallery (Pictures/ElimuAR).</summary>
    public static class Gallery
    {
        public static bool Save(byte[] png, string name)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                using (var resolver = activity.Call<AndroidJavaObject>("getContentResolver"))
                using (var values = new AndroidJavaObject("android.content.ContentValues"))
                using (var media = new AndroidJavaClass("android.provider.MediaStore$Images$Media"))
                {
                    values.Call("put", "_display_name", name);
                    values.Call("put", "mime_type", "image/png");
                    values.Call("put", "relative_path", "Pictures/ElimuAR");
                    var collection = media.GetStatic<AndroidJavaObject>("EXTERNAL_CONTENT_URI");
                    using (var uri = resolver.Call<AndroidJavaObject>("insert", collection, values))
                    {
                        if (uri == null) return false;
                        using (var stream = resolver.Call<AndroidJavaObject>("openOutputStream", uri))
                        {
                            stream.Call("write", png);
                            stream.Call("close");
                        }
                    }
                }
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[ElimuAR] photo not saved to the gallery: " + e.Message);
            }
#endif
            var dir = Path.Combine(Application.persistentDataPath, "Photos");
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, name), png);
            return true;
        }
    }
}
