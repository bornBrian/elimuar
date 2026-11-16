using System;
using System.Collections.Generic;
using UnityEngine;

namespace ElimuAR
{
    // The line icons, drawn once into textures from vector strokes on a 24-unit grid: round caps, even
    // stroke, no fills except where noted.
    public static class Icons
    {
        private const int Size = 128;
        private static readonly Dictionary<string, Sprite> Cache = new Dictionary<string, Sprite>();

        private abstract class Shape { public abstract float Distance(Vector2 p); public bool Fill; }

        private class Segment : Shape
        {
            public Vector2 A, B;
            public override float Distance(Vector2 p)
            {
                var ab = B - A;
                var t = Mathf.Clamp01(Vector2.Dot(p - A, ab) / Mathf.Max(1e-5f, ab.sqrMagnitude));
                return Vector2.Distance(p, A + ab * t);
            }
        }

        private class Ring : Shape
        {
            public Vector2 C; public float R; public float From = 0, To = 360;
            public override float Distance(Vector2 p)
            {
                var d = p - C;
                if (Fill) return Mathf.Max(0, d.magnitude - R) - 0.0001f;
                var angle = Mathf.Atan2(-d.y, d.x) * Mathf.Rad2Deg;
                if (angle < 0) angle += 360;
                var inArc = To - From >= 359.9f || (From <= To ? angle >= From && angle <= To : angle >= From || angle <= To);
                if (inArc) return Mathf.Abs(d.magnitude - R);
                var a = Point(From); var b = Point(To);
                return Mathf.Min(Vector2.Distance(p, a), Vector2.Distance(p, b));
            }
            private Vector2 Point(float deg) =>
                C + new Vector2(Mathf.Cos(deg * Mathf.Deg2Rad), -Mathf.Sin(deg * Mathf.Deg2Rad)) * R;
        }

        private class Polygon : Shape
        {
            public Vector2[] P;
            public override float Distance(Vector2 p)
            {
                var inside = false;
                var best = float.MaxValue;
                for (int i = 0, j = P.Length - 1; i < P.Length; j = i++)
                {
                    if ((P[i].y > p.y) != (P[j].y > p.y) &&
                        p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x) inside = !inside;
                    best = Mathf.Min(best, new Segment { A = P[i], B = P[j] }.Distance(p));
                }
                return Fill && inside ? 0 : best;
            }
        }

        private class Builder
        {
            public readonly List<Shape> Shapes = new List<Shape>();
            public float Stroke = 1.8f;
            public Builder Line(float x1, float y1, float x2, float y2)
            {
                Shapes.Add(new Segment { A = new Vector2(x1, y1), B = new Vector2(x2, y2) });
                return this;
            }
            public Builder Poly(params float[] xy)
            {
                for (var i = 0; i + 3 < xy.Length; i += 2) Line(xy[i], xy[i + 1], xy[i + 2], xy[i + 3]);
                return this;
            }
            public Builder Circle(float x, float y, float r, bool fill = false)
            {
                Shapes.Add(new Ring { C = new Vector2(x, y), R = r, Fill = fill });
                return this;
            }
            public Builder Arc(float x, float y, float r, float from, float to)
            {
                Shapes.Add(new Ring { C = new Vector2(x, y), R = r, From = from, To = to });
                return this;
            }
            public Builder Fill(params float[] xy)
            {
                var pts = new Vector2[xy.Length / 2];
                for (var i = 0; i < pts.Length; i++) pts[i] = new Vector2(xy[i * 2], xy[i * 2 + 1]);
                Shapes.Add(new Polygon { P = pts, Fill = true });
                return this;
            }
            public Builder Rect(float x1, float y1, float x2, float y2) => Poly(x1, y1, x2, y1, x2, y2, x1, y2, x1, y1);
        }

        private static readonly Dictionary<string, Action<Builder>> Glyphs = new Dictionary<string, Action<Builder>>
        {
            ["more"] = b => b.Circle(12, 5, 1.6f, true).Circle(12, 12, 1.6f, true).Circle(12, 19, 1.6f, true),
            ["help"] = b => b.Arc(12, 8.5f, 4.5f, 330, 180).Line(14.8f, 12.2f, 12, 14.5f).Line(12, 14.5f, 12, 16).Circle(12, 20.2f, 1.2f, true),
            ["hide"] = b =>
            {
                // A dashed 2x2 grid with one filled cell (Hide).
                b.Fill(3, 13, 10, 13, 10, 20, 3, 20);
                foreach (var (x, y) in new[] { (3f, 4f), (14f, 4f), (14f, 13f) })
                    b.Line(x, y, x + 2.5f, y).Line(x + 4.5f, y, x + 7, y).Line(x + 7, y, x + 7, y + 2.5f).Line(x + 7, y + 4.5f, x + 7, y + 7)
                     .Line(x + 7, y + 7, x + 4.5f, y + 7).Line(x + 2.5f, y + 7, x, y + 7).Line(x, y + 7, x, y + 4.5f).Line(x, y + 2.5f, x, y);
            },
            ["show"] = b => b.Rect(3, 4, 10, 11).Rect(14, 4, 21, 11).Rect(14, 13, 21, 20).Fill(3, 13, 10, 13, 10, 20, 3, 20),
            ["back"] = b => b.Line(20, 12, 4, 12).Poly(10, 6, 4, 12, 10, 18),
            ["next"] = b => b.Line(4, 12, 20, 12).Poly(14, 6, 20, 12, 14, 18),
            ["anchor"] = b => b.Circle(12, 4.5f, 2).Line(12, 6.5f, 12, 21).Line(8, 10, 16, 10).Arc(12, 13, 8, 200, 340).Poly(3, 15, 4.5f, 13.3f, 6.5f, 15).Poly(17.5f, 15, 19.5f, 13.3f, 21, 15),
            ["done"] = b => b.Poly(4, 12.5f, 10, 18.5f, 20, 6),
            ["reset"] = b => b.Arc(12, 12, 7.5f, 60, 360).Poly(19.5f, 4.5f, 19.5f, 10, 14, 10),
            ["replay"] = b => b.Arc(12, 12, 7.5f, 200, 160).Poly(4.5f, 4.5f, 4.5f, 10, 10, 10),
            ["exit"] = b => b.Poly(10, 4, 20, 4, 20, 20, 10, 20).Line(15, 12, 3, 12).Poly(7, 8, 3, 12, 7, 16),
            ["play"] = b => b.Poly(7, 4, 19, 12, 7, 20, 7, 4),
            ["search"] = b => b.Circle(10, 10, 6).Line(14.5f, 14.5f, 20, 20),
            ["settings"] = b =>
            {
                b.Circle(12, 12, 3.2f).Circle(12, 12, 6.5f);
                for (var i = 0; i < 8; i++)
                {
                    var a = Mathf.PI * i / 4f;
                    b.Line(12 + 6.5f * Mathf.Cos(a), 12 + 6.5f * Mathf.Sin(a), 12 + 9 * Mathf.Cos(a), 12 + 9 * Mathf.Sin(a));
                }
            },
            ["download"] = b => b.Line(12, 3, 12, 15).Poly(7, 10, 12, 15, 17, 10).Line(4, 20, 20, 20),
            ["archive"] = b => b.Rect(3, 4, 21, 9).Poly(5, 9, 5, 20, 19, 20, 19, 9).Line(9.5f, 13, 14.5f, 13),
            ["trash"] = b => b.Line(4, 6, 20, 6).Poly(9, 6, 9, 3.5f, 15, 3.5f, 15, 6).Poly(6, 6, 7, 20.5f, 17, 20.5f, 18, 6).Line(10, 10, 10, 17).Line(14, 10, 14, 17),
            ["user"] = b => b.Circle(12, 8, 4).Arc(12, 21, 8, 0, 180),
            ["class"] = b => b.Rect(3, 4, 21, 16).Line(8, 20.5f, 16, 20.5f).Line(12, 16, 12, 20.5f),
            ["close"] = b => b.Line(5, 5, 19, 19).Line(19, 5, 5, 19),
            ["tools"] = b => b.Rect(3, 3, 10, 10).Rect(14, 3, 21, 10).Rect(3, 14, 10, 21).Rect(14, 14, 21, 21),
            ["parts"] = b => b.Poly(8, 21, 8, 9.5f).Arc(10, 9.5f, 2, 180, 360).Poly(12, 9.5f, 12, 13).Arc(14, 11.5f, 2, 180, 360).Poly(16, 11.5f, 16, 14).Arc(18, 13, 2, 180, 360).Poly(20, 13, 20, 17.5f, 17, 21.5f, 10, 21.5f, 5, 16.5f, 6.5f, 15, 8, 16.5f).Line(8, 9.5f, 8, 4).Arc(10, 4, 2, 180, 360).Line(12, 4, 12, 9.5f),
            ["all"] = b => b.Line(12, 3, 12, 21).Line(3, 12, 21, 12).Poly(9, 6, 12, 3, 15, 6).Poly(9, 18, 12, 21, 15, 18).Poly(6, 9, 3, 12, 6, 15).Poly(18, 9, 21, 12, 18, 15),
            ["rotate"] = b => b.Arc(12, 12, 8, 30, 300).Poly(20, 5, 19.5f, 9.5f, 15, 9),
            ["scale"] = b => b.Line(5, 19, 19, 5).Poly(12, 5, 19, 5, 19, 12).Poly(5, 12, 5, 19, 12, 19),
            ["draw"] = b => b.Poly(4, 20, 5, 15.5f, 16, 4.5f, 19.5f, 8, 8.5f, 19, 4, 20).Line(13.5f, 7, 17, 10.5f),
            ["erase"] = b => b.Poly(9, 20, 3.5f, 14.5f, 13, 5, 20.5f, 12.5f, 13, 20, 9, 20).Line(8.5f, 10, 16, 17.5f).Line(13, 20, 21, 20),
            ["clear"] = b => b.Line(4, 6, 20, 6).Poly(9, 6, 9, 3.5f, 15, 3.5f, 15, 6).Poly(6, 6, 7, 20.5f, 17, 20.5f, 18, 6),
            ["camera"] = b => b.Poly(3, 8, 7, 8, 9, 5, 15, 5, 17, 8, 21, 8, 21, 19, 3, 19, 3, 8).Circle(12, 13, 3.5f),
            ["restart"] = b => b.Arc(12, 12, 7.5f, 60, 360).Poly(19.5f, 4.5f, 19.5f, 10, 14, 10),
            ["arsettings"] = b => b.Poly(4, 8, 12, 4, 20, 8, 12, 12, 4, 8).Poly(4, 12, 12, 16, 20, 12).Poly(4, 16, 12, 20, 20, 16),
            ["check"] = b => b.Poly(4, 12.5f, 10, 18.5f, 20, 6),
            ["lock"] = b => b.Rect(5, 11, 19, 21).Arc(12, 11, 4.5f, 0, 180).Line(7.5f, 11, 7.5f, 9).Line(16.5f, 11, 16.5f, 9),
            ["info"] = b => b.Circle(12, 12, 9).Line(12, 11, 12, 17).Circle(12, 7.5f, 1.1f, true),
            ["home"] = b => b.Poly(3, 11, 12, 3.5f, 21, 11).Poly(5.5f, 9.5f, 5.5f, 20, 18.5f, 20, 18.5f, 9.5f),
            ["library"] = b => b.Rect(4, 4, 8, 20).Rect(10, 4, 14, 20).Poly(16, 5, 19.5f, 4, 22, 19, 18.5f, 20, 16, 5),
            ["assign"] = b => b.Rect(5, 4, 19, 21).Rect(9, 2.5f, 15, 6).Poly(8.5f, 13, 11, 15.5f, 15.5f, 10.5f),
            ["wifi"] = b => b.Arc(12, 19, 14, 45, 135).Arc(12, 19, 9.5f, 45, 135).Arc(12, 19, 5, 45, 135).Circle(12, 19, 1.3f, true),
            ["phone"] = b => b.Poly(6, 7, 20, 7, 21, 8, 21, 16, 20, 17, 6, 17, 5, 16, 5, 8, 6, 7).Line(18.5f, 10, 18.5f, 14)
                .Poly(9, 17, 7.5f, 22).Poly(5, 13, 3.5f, 14.5f, 3.5f, 19, 6, 22),
            ["clock"] = b => b.Circle(12, 12, 9).Line(12, 12, 12, 6.5f).Line(12, 12, 16, 14.5f),
            ["flask"] = b => b.Line(8.5f, 3, 15.5f, 3).Line(10, 3, 10, 9).Line(14, 3, 14, 9).Poly(10, 9, 4.5f, 19, 5.5f, 21, 18.5f, 21, 19.5f, 19, 14, 9)
                .Fill(7, 15, 17, 15, 19, 19.2f, 18.2f, 20.5f, 5.8f, 20.5f, 5, 19.2f),
            ["cube"] = b => b.Poly(4, 8, 12, 4, 20, 8, 20, 17, 12, 21, 4, 17, 4, 8).Line(4, 8, 12, 12).Line(12, 12, 20, 8).Line(12, 12, 12, 21)
                .Fill(12, 12, 20, 8, 20, 17, 12, 21),
            ["ar"] = b => b.Poly(12, 3, 20, 7.5f, 20, 16.5f, 12, 21, 4, 16.5f, 4, 7.5f, 12, 3).Poly(4, 7.5f, 12, 12, 20, 7.5f).Line(12, 12, 12, 21),
        };

        public static Sprite Get(string name)
        {
            if (Cache.TryGetValue(name, out var cached)) return cached;
            if (!Glyphs.TryGetValue(name, out var draw)) draw = Glyphs["info"];
            var b = new Builder();
            draw(b);
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, true) { name = "icon-" + name, wrapMode = TextureWrapMode.Clamp };
            var pixels = new Color32[Size * Size];
            var unit = Size / 24f;
            var half = b.Stroke * 0.5f;
            var aa = 1.1f / unit;
            for (var y = 0; y < Size; y++)
            for (var x = 0; x < Size; x++)
            {
                var p = new Vector2((x + 0.5f) / unit, (Size - y - 0.5f) / unit);
                var d = float.MaxValue;
                foreach (var s in b.Shapes) d = Mathf.Min(d, s.Fill ? s.Distance(p) - 0.0f : s.Distance(p) - half);
                var a = Mathf.Clamp01(0.5f - d / aa);
                pixels[y * Size + x] = new Color32(255, 255, 255, (byte)(a * 255));
            }
            tex.SetPixels32(pixels);
            tex.Apply(true, true);
            var sprite = Sprite.Create(tex, new Rect(0, 0, Size, Size), new Vector2(0.5f, 0.5f), 100);
            Cache[name] = sprite;
            return sprite;
        }
    }
}
