using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace ElimuAR
{
    /// <summary>The explore model's ghosting.</summary>
    public class Faders
    {
        private class Entry
        {
            public FaderInfo Info;
            public Renderer[] Renderers;
            public Material[][] Solid;
            public Material[][] Ghost;
            public float Alpha = 1f;
        }

        private const float GhostAlpha = 0.28f;
        private static readonly int BaseColor = Shader.PropertyToID("_BaseColor");
        private static readonly int ColorId = Shader.PropertyToID("_Color");

        private readonly List<Entry> _entries = new List<Entry>();
        private readonly MonoBehaviour _host;

        public Faders(ActivityScene scene, MonoBehaviour host)
        {
            _host = host;
            var named = new Dictionary<string, Material>();
            foreach (var m in Resources.FindObjectsOfTypeAll<Material>())
                if (!named.ContainsKey(m.name)) named[m.name] = m;

            foreach (var info in scene.Manifest.faders)
            {
                var t = scene.Find(info.path);
                if (t == null) continue;
                var renderers = t.GetComponents<Renderer>();
                if (renderers.Length == 0) renderers = t.GetComponentsInChildren<Renderer>(true);
                if (renderers.Length == 0) continue;
                named.TryGetValue(info.metallicMaterial ?? "", out var metallic);
                named.TryGetValue(info.specMaterial ?? "", out var spec);
                var entry = new Entry { Info = info, Renderers = renderers };
                entry.Solid = renderers.Select(r => r.sharedMaterials).ToArray();
                entry.Ghost = renderers.Select(r => r.sharedMaterials.Select(m => GhostOf(m, metallic, spec)).ToArray()).ToArray();
                _entries.Add(entry);
            }
        }

        public int Count => _entries.Count;

        /// <summary>A transparent copy keeping the solid material's colour and texture.</summary>
        private static Material GhostOf(Material solid, Material metallic, Material spec)
        {
            if (solid == null) return null;
            // The app's own transparent URP material: a bundle's copy of the
            // shader may not draw on this engine version.
            var template = Materials.LitTransparent;
            var ghost = new Material(template) { name = solid.name + " (ghost)" };
            var tex = solid.HasProperty("_BaseMap") ? solid.GetTexture("_BaseMap") : solid.HasProperty("_MainTex") ? solid.GetTexture("_MainTex") : null;
            if (tex != null)
            {
                if (ghost.HasProperty("_BaseMap")) ghost.SetTexture("_BaseMap", tex);
                if (ghost.HasProperty("_MainTex")) ghost.SetTexture("_MainTex", tex);
            }
            var color = solid.HasProperty(BaseColor) ? solid.GetColor(BaseColor) : solid.HasProperty(ColorId) ? solid.GetColor(ColorId) : Color.white;
            SetAlpha(ghost, color, GhostAlpha);
            return ghost;
        }

        private static void SetAlpha(Material m, Color color, float alpha)
        {
            color.a = alpha;
            if (m.HasProperty(BaseColor)) m.SetColor(BaseColor, color);
            if (m.HasProperty(ColorId)) m.SetColor(ColorId, color);
        }

        // Ghosts every fader object except those under the given transforms (the part in hand and the parts
        // already on trays); null shows all solid.
        public void Ghost(ICollection<Transform> solidParts)
        {
            foreach (var e in _entries)
            {
                var keepSolid = solidParts == null || e.Renderers.Any(r => r != null && solidParts.Any(p => p != null && r.transform.IsChildOf(p)));
                var target = keepSolid ? 1f : GhostAlpha;
                if (Mathf.Approximately(e.Alpha, target)) continue;
                e.Alpha = target;
                for (var i = 0; i < e.Renderers.Length; i++)
                {
                    var r = e.Renderers[i];
                    if (r == null) continue;
                    r.sharedMaterials = keepSolid ? e.Solid[i] : e.Ghost[i];
                    if (e.Info.disableRendererAtZero && target <= 0f) r.enabled = false;
                    else r.enabled = true;
                }
            }
        }
    }
}
