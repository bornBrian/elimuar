using UnityEngine;

namespace ElimuAR
{
    /// <summary>The handful of materials the app draws with itself.</summary>
    public static class Materials
    {
        private static Material _wash, _line, _mat, _shadow, _reticle, _ink, _lit, _unlit, _litTransparent;

        public static Material PlaneWash => _wash ??= Load("PlaneWash");
        public static Material PlaneLine => _line ??= Load("PlaneLine");
        public static Material Mat => _mat ??= Load("Mat");
        public static Material Shadow => _shadow ??= Load("Shadow");
        public static Material Reticle => _reticle ??= Load("Reticle");
        public static Material Ink => _ink ??= Load("Ink");
        public static Material Lit => _lit ??= Load("Lit");
        public static Material Unlit => _unlit ??= Load("Unlit");
        public static Material LitTransparent => _litTransparent ??= Load("LitTransparent");

        private static Material Load(string name)
        {
            var m = Resources.Load<Material>("Materials/" + name);
            if (m == null)
            {
                Debug.LogWarning("[ElimuAR] material " + name + " missing; using a default");
                m = new Material(Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Sprites/Default"));
            }
            return m;
        }
    }
}
