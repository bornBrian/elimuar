using UnityEngine;

namespace ElimuAR
{
    /// <summary>The learner's preferences on this device.</summary>
    public static class Settings
    {
        public static float VoiceoverVolume
        {
            get => PlayerPrefs.GetFloat("voVolume", 1f);
            set { PlayerPrefs.SetFloat("voVolume", Mathf.Clamp01(value)); PlayerPrefs.Save(); }
        }

        public static bool Muted
        {
            get => PlayerPrefs.GetInt("muted", 0) == 1;
            set { PlayerPrefs.SetInt("muted", value ? 1 : 0); PlayerPrefs.Save(); }
        }

        public static bool Captions
        {
            get => PlayerPrefs.GetInt("captions", 1) == 1;
            set { PlayerPrefs.SetInt("captions", value ? 1 : 0); PlayerPrefs.Save(); }
        }

        public static bool UiSounds
        {
            get => PlayerPrefs.GetInt("uiSounds", 1) == 1;
            set { PlayerPrefs.SetInt("uiSounds", value ? 1 : 0); PlayerPrefs.Save(); }
        }

        public static bool SurfaceGuides
        {
            get => PlayerPrefs.GetInt("surfaceGuides", 1) == 1;
            set { PlayerPrefs.SetInt("surfaceGuides", value ? 1 : 0); PlayerPrefs.Save(); }
        }

        public static float EffectiveVoiceVolume => Muted ? 0f : VoiceoverVolume;
    }
}
