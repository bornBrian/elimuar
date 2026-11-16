using TMPro;
using UnityEngine;

namespace ElimuAR
{
    /// <summary>The app's visual language.</summary>
    public static class Theme
    {
        public static readonly Color Ink = Hex(0x2B2B2B);
        public static readonly Color InkSoft = Hex(0x6B6B6B);
        public static readonly Color InkFaint = Hex(0x9E9E9E);
        public static readonly Color Paper = Hex(0xE6E6E6);
        public static readonly Color Grid = Hex(0xCFCFCF);
        public static readonly Color Card = new Color(0.975f, 0.975f, 0.975f, 0.94f);
        public static readonly Color CardSolid = Hex(0xF8F8F8);
        public static readonly Color Frost = new Color(0.94f, 0.93f, 0.92f, 0.88f);
        public static readonly Color White = Color.white;
        public static readonly Color Line = Hex(0xBDBDBD);
        public static readonly Color Field = Color.white;
        public static readonly Color FieldStroke = Hex(0xCFCFCF);
        public static readonly Color Brand = Hex(0xE2231A);      // accent red
        public static readonly Color BrandDark = Hex(0xB0170F);
        public static readonly Color Search = Hex(0xF0F0F0);
        public static readonly Color Divider = Hex(0xE0E0E0);
        public static readonly Color Tile = Hex(0xEEEEEE);
        public static readonly Color WrongBanner = Hex(0xE21F26);
        public static readonly Color Score = Hex(0x4B1A8C);      // score purple
        public static readonly Color ScoreEnd = Hex(0xD7263D);   // score red
        public static readonly Color Correct = Hex(0x2E7D32);
        public static readonly Color Wrong = Hex(0xC62828);
        public static readonly Color Scrim = new Color(0, 0, 0, 0.45f);
        public static readonly Color Disabled = new Color(1, 1, 1, 0.45f);

        public const float CardRadius = 42f;
        public const float TileRadius = 30f;
        public const float TileSize = 190f;
        public const float Margin = 48f;

        public const float TitleSize = 84f;
        public const float HeadingSize = 64f;
        public const float BodySize = 44f;
        public const float LabelSize = 40f;
        public const float SmallSize = 32f;

        private static TMP_FontAsset _regular, _medium, _semibold, _bold;
        public static TMP_FontAsset Regular => _regular ??= Load("Montserrat-Regular SDF");
        public static TMP_FontAsset Medium => _medium ??= Load("Montserrat-Medium SDF");
        public static TMP_FontAsset SemiBold => _semibold ??= Load("Montserrat-SemiBold SDF");
        public static TMP_FontAsset Bold => _bold ??= Load("Montserrat-Bold SDF");

        private static TMP_FontAsset Load(string name)
        {
            var font = Resources.Load<TMP_FontAsset>("Fonts/" + name);
            return font != null ? font : TMP_Settings.defaultFontAsset;
        }

        public static Color Hex(int rgb, float alpha = 1f) =>
            new Color(((rgb >> 16) & 0xFF) / 255f, ((rgb >> 8) & 0xFF) / 255f, (rgb & 0xFF) / 255f, alpha);
    }
}
