using UnityEngine;

namespace ElimuAR
{
    // Turns a label to face the camera about the vertical axis, so it reads from wherever the learner
    // stands.
    public class FaceCamera : MonoBehaviour
    {
        private void LateUpdate()
        {
            var cam = Camera.main;
            if (cam == null) return;
            var away = transform.position - cam.transform.position;
            away.y = 0;
            if (away.sqrMagnitude < 1e-6f) return;
            transform.rotation = Quaternion.LookRotation(away.normalized, Vector3.up);
        }
    }
}
