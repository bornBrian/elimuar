#if UNITY_EDITOR
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace ElimuAR.Tests
{
    /// <summary>Runs the screen tour in play mode (the test runner is the way to get a headless play mode).</summary>
    public class ElimuTourTest
    {
        [UnityTest, Timeout(1800000)]
        public IEnumerator Tour()
        {
            if (!ScreenTour.Requested) { Assert.Ignore("ELIMU_TOUR not set"); yield break; }
            while (!ScreenTour.Finished) yield return null;
            Assert.IsNull(ScreenTour.Failure, ScreenTour.Failure?.ToString());
        }
    }
}
#endif
