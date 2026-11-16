using System.Collections.Generic;
using Newtonsoft.Json;

namespace ElimuAR
{
    // An activity's playable configuration (format elimuar-activity/1), read out of its bundle by the
    // server's importer.
    public class ActivityManifest
    {
        public string format;
        public string scenePath;
        public string rootPath;
        public ActivitySettings settings = new ActivitySettings();
        public List<ManifestSection> sections = new List<ManifestSection>();
        public List<DragItem> dragItems = new List<DragItem>();
        public List<ScienceObjectInfo> scienceObjects = new List<ScienceObjectInfo>();
        public List<TrayInfo> trays = new List<TrayInfo>();
        public List<FaderInfo> faders = new List<FaderInfo>();
        public IntroInfo intro;
        public AnimatorInfo animator;
        public List<string> exploreRoots = new List<string>();
        public List<string> audioClips = new List<string>();
        public List<string> animationClips = new List<string>();
    }

    public class ActivitySettings
    {
        public bool occlusion;
        public bool showDesk = true;
        public Vec3 deskOffset = new Vec3();
    }

    public class Vec3
    {
        public float x, y, z;
    }

    public class ManifestSection
    {
        /// <summary>observe, explore, question or summary.</summary>
        public string kind;
        public bool randomize;
        public int maxSteps = -1;
        public List<ManifestStep> steps = new List<ManifestStep>();
    }

    public class ManifestStep
    {
        public string id;
        /// <summary>step or question.</summary>
        public string kind;
        public string title;
        public string description;
        public string imageName;
        public bool autoplayVO = true;
        public string voClip;
        public List<Caption> captions = new List<Caption>();
        public List<StepButton> buttons = new List<StepButton>();
        public bool confirmMoveOn;
        public ConfirmText confirm = new ConfirmText();
        public Countdown countdown = new Countdown();
        public List<string> objectPaths = new List<string>();
        public QuestionInfo question;

        [JsonIgnore] public bool IsQuestion => question != null && question.answers != null && question.answers.Count > 0;
        [JsonIgnore] public string SectionKind;
    }

    public class Caption
    {
        public float duration;
        public string text;
    }

    public class StepButton
    {
        public string id;
        public string text;
        public bool active = true;
        public bool enabled = true;
    }

    public class ConfirmText
    {
        public string title;
        public string content;
        public string confirm;
        public string cancel;
    }

    public class Countdown
    {
        public float duration = 5f;
        public string text = "Moving on in...";
    }

    public class QuestionInfo
    {
        public bool randomizeAnswers = true;
        public string correctHeader;
        public string incorrectHeader;
        public string correctFeedback;
        public string incorrectFeedback;
        public List<Answer> answers = new List<Answer>();
    }

    public class Answer
    {
        public string text;
        public bool correct;
        public string feedback;
        public string iconName;
    }

    public class DragItem
    {
        public string path;
        public bool isDraggable = true;
        public string dragPath;
        public string targetPath;
        public bool useLocalTransform = true;
        public bool returnWhenOver;
        public float returnDuration = 0.3f;
        public float targetTweenDuration = 0.3f;
        public string holdClip;
        public string holdCaption;
        public float holdCaptionMinimumDuration;
        public float snapRadius;
        public string fits;
        public float lift;
        public Vec3 approach;
    }

    public class ScienceObjectInfo
    {
        public string path;
        public string name;
        public string trayPath;
        public bool hasTransitionAnimation;
    }

    public class TrayInfo
    {
        public string path;
        public string labelPath;
        public string targetPath;
    }

    public class FaderInfo
    {
        public string path;
        public string metallicMaterial;
        public string specMaterial;
        public bool disableRendererAtZero = true;
        public float alpha = 1f;
        public string referencePath;
    }

    public class IntroInfo
    {
        public string path;
        public string replayId;
    }

    public class AnimatorInfo
    {
        public string path;
        public string startState;
    }
}
