using UnityEngine;

namespace ElimuAR
{
    // The activity.json of an activity authored for ElimuAR , carried inside its scene so the bundle is the one file the web console uploads.
    public class ActivityManifestAsset : MonoBehaviour
    {
        [TextArea(4, 40)] public string json;
    }
}
