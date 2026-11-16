using UnityEngine;
using UnityEngine.Scripting;

namespace ElimuAR
{
    [Preserve]
    [ExecuteAlways]
    [RequireComponent(typeof(MeshFilter), typeof(MeshRenderer))]
    public class Cable : MonoBehaviour
    {
        public Transform from;
        public Transform to;
        public float radius = 0.0025f;
        public float slack = 0.25f;
        public int segments = 28;
        public int sides = 8;

        private Mesh _mesh;
        private Vector3 _lastFrom, _lastTo;
        private Quaternion _lastFromRot, _lastToRot;

        private void OnEnable()
        {
            _mesh = new Mesh { name = "Cable" };
            _mesh.MarkDynamic();
            GetComponent<MeshFilter>().sharedMesh = _mesh;
            Rebuild();
        }

        private void LateUpdate()
        {
            if (from == null || to == null) return;
            if (from.position == _lastFrom && to.position == _lastTo && from.rotation == _lastFromRot && to.rotation == _lastToRot) return;
            Rebuild();
        }

        public void Rebuild()
        {
            if (from == null || to == null || _mesh == null) return;
            _lastFrom = from.position;
            _lastTo = to.position;
            _lastFromRot = from.rotation;
            _lastToRot = to.rotation;

            var scale = Mathf.Max(1e-4f, transform.lossyScale.x);
            var a = transform.InverseTransformPoint(from.position);
            var b = transform.InverseTransformPoint(to.position);
            var length = Vector3.Distance(a, b);
            var reach = Mathf.Max(0.02f, length * 0.35f);
            var a1 = a + transform.InverseTransformDirection(from.forward) * reach;
            var b1 = b + transform.InverseTransformDirection(to.forward) * reach;
            var sag = Vector3.down * length * slack;

            var points = new Vector3[segments + 1];
            for (var i = 0; i <= segments; i++)
            {
                var t = i / (float)segments;
                var u = 1 - t;
                var p = u * u * u * a + 3 * u * u * t * a1 + 3 * u * t * t * b1 + t * t * t * b;
                p += sag * (4 * t * u);
                points[i] = p;
            }

            var r = radius / scale;
            var vertices = new Vector3[(segments + 1) * (sides + 1)];
            var normals = new Vector3[vertices.Length];
            var uvs = new Vector2[vertices.Length];
            var up = Vector3.up;
            for (var i = 0; i <= segments; i++)
            {
                var forward = (points[Mathf.Min(i + 1, segments)] - points[Mathf.Max(i - 1, 0)]).normalized;
                if (forward == Vector3.zero) forward = Vector3.forward;
                var side = Vector3.Cross(forward, up);
                if (side.sqrMagnitude < 1e-6f) side = Vector3.Cross(forward, Vector3.right);
                side.Normalize();
                var normalUp = Vector3.Cross(side, forward);
                up = normalUp;
                for (var j = 0; j <= sides; j++)
                {
                    var angle = j / (float)sides * Mathf.PI * 2;
                    var n = side * Mathf.Cos(angle) + normalUp * Mathf.Sin(angle);
                    var k = i * (sides + 1) + j;
                    vertices[k] = points[i] + n * r;
                    normals[k] = n;
                    uvs[k] = new Vector2(j / (float)sides, i / (float)segments);
                }
            }

            var triangles = new int[segments * sides * 6];
            var w = 0;
            for (var i = 0; i < segments; i++)
            for (var j = 0; j < sides; j++)
            {
                var a0 = i * (sides + 1) + j;
                var b0 = a0 + sides + 1;
                triangles[w++] = a0;
                triangles[w++] = b0;
                triangles[w++] = a0 + 1;
                triangles[w++] = a0 + 1;
                triangles[w++] = b0;
                triangles[w++] = b0 + 1;
            }

            _mesh.Clear();
            _mesh.vertices = vertices;
            _mesh.normals = normals;
            _mesh.uv = uvs;
            _mesh.triangles = triangles;
            _mesh.RecalculateBounds();
        }
    }
}
