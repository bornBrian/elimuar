using UnityEngine;
using UnityEngine.Scripting;

namespace ElimuAR
{
    /// <summary>Keeps a part turning (a fan's blades).</summary>
    [Preserve]
    public class Spinner : MonoBehaviour
    {
        public Vector3 axis = Vector3.forward;
        public float degreesPerSecond = 540f;

        private void Update() => transform.Rotate(axis, degreesPerSecond * Time.deltaTime, Space.Self);
    }

    // Turns a label to face the viewer, about the vertical axis only, so the text stays upright and readable
    // from wherever the learner stands.
    [Preserve]
    public class FaceViewer : MonoBehaviour
    {
        private Camera _camera;

        private void LateUpdate()
        {
            if (_camera == null || !_camera.isActiveAndEnabled) _camera = Camera.main != null ? Camera.main : FindAnyObjectByType<Camera>();
            if (_camera == null) return;
            var away = transform.position - _camera.transform.position;
            away.y = 0;
            if (away.sqrMagnitude > 1e-6f) transform.rotation = Quaternion.LookRotation(away, Vector3.up);
        }
    }
}
