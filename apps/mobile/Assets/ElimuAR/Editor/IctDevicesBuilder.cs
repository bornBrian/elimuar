using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using static ElimuAR.Editor.AuthoringKit;

namespace ElimuAR.Editor
{
    /// <summary>
    /// ICT activity "Input and Output Devices" (Computer Science, Form 1: input
    /// and output devices). A computer desk. Observe follows the narration: data
    /// flows as red packets from each input device into the system unit, and
    /// back out to the monitor; the printer feeds out a page and the speakers
    /// pulse. Explore sorts the eight devices onto trays under INPUT and OUTPUT.
    ///
    ///   ElimuAR → Build ICT: Input and Output Devices
    ///   Unity.exe -batchmode -projectPath apps/mobile -executeMethod ElimuAR.Editor.IctDevicesBuilder.Build -quit
    /// </summary>
    public static class IctDevicesBuilder
    {
        private const float Desk = 0.03f; // the top of the desk board

        [MenuItem("ElimuAR/Build ICT: Input and Output Devices")]
        public static void Build()
        {
            var kit = new AuthoringKit("inputoutputdevices", "InputOutputDevices", "InputOutputDevices_Root");
            kit.BeginScene();
            var cue = kit.Cues;

            // ---- Observe ------------------------------------------------------------------------
            var o = DeskSet(kit, kit.Observe);
            void L(string key, string text, Vector3 lift) => kit.Label(key, text, o[key].position + lift);
            L("Keyboard", "Keyboard", new Vector3(0, 0.12f, -0.06f));
            L("Mouse", "Mouse", new Vector3(0.02f, 0.11f, -0.06f));
            L("Microphone", "Microphone", new Vector3(0, 0.3f, -0.04f));
            L("Webcam", "Webcam", new Vector3(0, 0.1f, -0.05f));
            L("Monitor", "Monitor", new Vector3(0, 0.42f, -0.04f));
            L("Printer", "Printer", new Vector3(0, 0.26f, -0.06f));
            L("Speakers", "Speakers", new Vector3(0, 0.26f, -0.04f));
            kit.Label("Process", "PROCESS (CPU)", o["SystemUnit"].position + new Vector3(0, 0.46f, -0.06f));
            kit.Label("Input", "INPUT", new Vector3(-0.42f, 0.5f, -0.2f));
            kit.Label("Output", "OUTPUT", new Vector3(0.42f, 0.5f, -0.2f));

            kit.Show("Input", cue["intro"] + 1.0f, cue["process"] - 0.2f);
            kit.Show("Process", cue["intro"] + 2.0f, cue["intro"] + 4.5f);
            kit.Show("Output", cue["intro"] + 3.0f, cue["intro"] + 5.5f);

            // Input: each device hops as it is named, and its data flows into the system unit.
            var unit = o["SystemUnit"].position + new Vector3(0, 0.2f, 0);
            var packets = Packets(kit, 6);
            var next = 0;
            void Flow(Transform from, float at, int count = 3)
            {
                for (var i = 0; i < count; i++) Fly(kit, packets[next++ % packets.Count], from.position + Vector3.up * 0.04f, unit, at + i * 0.35f);
            }
            foreach (var key in new[] { "Keyboard", "Mouse", "Microphone", "Webcam" }) kit.Hop(o[key], cue["input"] + 1.5f + System.Array.IndexOf(new[] { "Keyboard", "Mouse", "Microphone", "Webcam" }, key) * 0.4f);
            kit.Show("Keyboard", cue["keyboard"] + 0.2f, cue["mouse"] - 0.1f);
            kit.Hop(o["Keyboard"], cue["keyboard"] + 0.3f);
            Flow(o["Keyboard"], cue["keyboard"] + 1.2f);
            kit.Show("Mouse", cue["mouse"] + 0.2f, cue["mic"] - 0.1f);
            kit.Hop(o["Mouse"], cue["mouse"] + 0.3f);
            kit.Out(o["Mouse"], cue["mouse"] + 1.0f, cue["mouse"] + 3.0f, new Vector3(0.05f, 0, 0.03f), 0.6f);
            Flow(o["Mouse"], cue["mouse"] + 1.3f);
            kit.Show("Microphone", cue["mic"] + 0.2f, cue["webcam"] - 0.1f);
            kit.Pulse(o["Microphone"], cue["mic"] + 0.4f, 0.08f);
            kit.Pulse(o["Microphone"], cue["mic"] + 1.4f, 0.08f);
            Flow(o["Microphone"], cue["mic"] + 1.0f);
            kit.Show("Webcam", cue["webcam"] + 0.2f, cue["process"] - 0.1f);
            kit.Hop(o["Webcam"], cue["webcam"] + 0.3f, 0.02f);
            Flow(o["Webcam"], cue["webcam"] + 1.0f);

            // Processing inside the system unit.
            kit.Show("Process", cue["process"] + 0.2f, cue["output"] - 0.1f);
            kit.Pulse(o["SystemUnit"], cue["process"] + 0.5f);
            kit.Pulse(o["SystemUnit"], cue["process"] + 1.6f);
            kit.Pulse(o["SystemUnit"], cue["process"] + 2.7f);

            // Output: information flows out to each device as it is named.
            kit.Show("Output", cue["output"] + 0.2f, cue["outro"] - 0.2f);
            void Back(Transform to, float at)
            {
                for (var i = 0; i < 3; i++) Fly(kit, packets[next++ % packets.Count], unit, to.position + Vector3.up * 0.15f, at + i * 0.35f);
            }
            kit.Show("Monitor", cue["monitor"] + 0.2f, cue["printer"] - 0.1f);
            Back(o["Monitor"], cue["monitor"] + 0.4f);
            kit.Pulse(o["Screen"], cue["monitor"] + 1.6f, 0.04f);
            kit.Show("Printer", cue["printer"] + 0.2f, cue["speakers"] - 0.1f);
            Back(o["Printer"], cue["printer"] + 0.4f);
            var page = o["Page"];
            kit.Pos(page, cue["printer"] + 1.5f, page.localPosition);
            kit.Pos(page, cue["printer"] + 3.5f, page.localPosition + new Vector3(0, -0.01f, -0.16f));
            kit.Pos(page, cue["outro"] - 0.5f, page.localPosition + new Vector3(0, -0.01f, -0.16f));
            kit.Pos(page, cue["outro"], page.localPosition);
            kit.Show("Speakers", cue["speakers"] + 0.2f, cue["outro"] - 0.1f);
            Back(o["Speakers"], cue["speakers"] + 0.3f);
            for (var i = 0; i < 6; i++) kit.Pulse(o["Speakers"], cue["speakers"] + 1.0f + i * 0.7f, 0.06f);

            // Outro: every device hops in turn.
            var order = new[] { "Keyboard", "Mouse", "Microphone", "Webcam", "Monitor", "Printer", "Speakers", "Projector" };
            for (var i = 0; i < order.Length; i++) kit.Hop(o[order[i]], cue["outro"] + 1.0f + i * 0.35f);
            var clip = kit.FinishTimeline();

            // ---- Explore: sort the devices onto INPUT and OUTPUT trays ----------------------------
            var e = DeskSet(kit, kit.Explore);
            var trays = Group(kit.Explore, "Trays", Vector3.zero);
            var groups = kit.Content["groups"].ToObject<Dictionary<string, List<string>>>();
            var side = -1;
            foreach (var group in new[] { "INPUT", "OUTPUT" })
            {
                var colour = group == "INPUT" ? new Color(0.15f, 0.39f, 0.92f) : new Color(0.89f, 0.14f, 0.1f);
                var centre = side * 0.33f;
                Box(trays, group + "Strip", new Vector3(centre, 0.002f, -0.45f), new Vector3(0.66f, 0.004f, 0.2f), kit.Mat(group + "Strip", Color.Lerp(colour, Color.white, 0.72f)));
                kit.Card(trays, group + "Sign", group, new Vector3(centre, 0.3f, -0.36f), 0.0011f, 340, 110, 72, colour, Color.white);
                for (var i = 0; i < groups[group].Count; i++)
                {
                    var key = groups[group][i];
                    var tray = kit.Tray(trays, "ScienceTray_" + key, new Vector3(centre - 0.24f + i * 0.16f, 0.004f, -0.45f), 0.14f, 0.14f);
                    kit.Link(e[key], tray, key);
                }
                side = 1;
            }

            kit.Finish(clip, new Vector3(-0.35f, 0.7f, -1.25f), new Vector3(0, 0.13f, 0), 34);
        }

        /// <summary>Small red "data" cubes, hidden until the timeline flies them.</summary>
        private static List<Transform> Packets(AuthoringKit kit, int count)
        {
            var list = new List<Transform>();
            var red = kit.Mat("Data", new Color(0.95f, 0.2f, 0.15f), 0, 0.7f);
            for (var i = 0; i < count; i++)
            {
                var p = Box(kit.Observe, "Packet" + i, Vector3.zero, Vector3.one * 0.016f, red);
                p.localScale = Vector3.zero;
                list.Add(p);
            }
            return list;
        }

        /// <summary>One packet appears at <paramref name="from"/>, flies in an arc to <paramref name="to"/>, and vanishes.</summary>
        private static void Fly(AuthoringKit kit, Transform packet, Vector3 from, Vector3 to, float at)
        {
            var size = Vector3.one * 0.016f;
            kit.Scl(packet, at - 0.01f, Vector3.zero);
            kit.Pos(packet, at - 0.01f, from);
            kit.Scl(packet, at, size);
            kit.Pos(packet, at, from);
            kit.Pos(packet, at + 0.45f, Vector3.Lerp(from, to, 0.5f) + Vector3.up * 0.08f);
            kit.Pos(packet, at + 0.9f, to);
            kit.Scl(packet, at + 0.9f, size);
            kit.Scl(packet, at + 0.95f, Vector3.zero);
        }

        /// <summary>
        /// The desk and its devices, the screen facing the viewer (−Z). Each
        /// device's pivot is at its base, so it stands on a tray.
        /// </summary>
        private static Dictionary<string, Transform> DeskSet(AuthoringKit kit, Transform parent)
        {
            var map = new Dictionary<string, Transform>();
            var wood = kit.Mat("Wood", new Color(0.62f, 0.45f, 0.3f), 0, 0.35f);
            var black = kit.Mat("Black", new Color(0.09f, 0.09f, 0.1f), 0.2f, 0.45f);
            var grey = kit.Mat("Grey", new Color(0.32f, 0.34f, 0.38f), 0.3f, 0.4f);
            var light = kit.Mat("LightGrey", new Color(0.82f, 0.83f, 0.85f), 0.1f, 0.4f);
            var screen = kit.Mat("ScreenGlow", new Color(0.2f, 0.55f, 0.95f), 0, 0.85f);
            var key = kit.Mat("Key", new Color(0.2f, 0.21f, 0.24f), 0, 0.3f);
            var paper = kit.Mat("Paper", new Color(0.97f, 0.97f, 0.95f), 0, 0.2f);
            var cone = kit.Mat("Cone", new Color(0.15f, 0.15f, 0.17f), 0, 0.2f);
            var lens = kit.Mat("Lens", new Color(0.1f, 0.25f, 0.45f), 0.6f, 0.95f);

            Box(parent, "Desk", new Vector3(0, Desk / 2, 0), new Vector3(1.2f, Desk, 0.52f), wood);

            var monitor = Group(parent, "Monitor", new Vector3(-0.06f, Desk, 0.13f));
            Box(monitor, "Foot", new Vector3(0, 0.005f, 0), new Vector3(0.16f, 0.01f, 0.1f), black);
            Box(monitor, "Neck", new Vector3(0, 0.07f, 0.02f), new Vector3(0.03f, 0.13f, 0.02f), black);
            Box(monitor, "Bezel", new Vector3(0, 0.25f, 0), new Vector3(0.42f, 0.26f, 0.022f), black);
            map["Screen"] = Box(monitor, "Screen", new Vector3(0, 0.255f, -0.0115f), new Vector3(0.39f, 0.225f, 0.002f), screen);
            map["Monitor"] = monitor;

            var webcam = Group(parent, "Webcam", new Vector3(-0.06f, Desk + 0.38f, 0.13f));
            Box(webcam, "Body", new Vector3(0, 0.013f, 0), new Vector3(0.07f, 0.026f, 0.028f), black);
            Cylinder(webcam, "Lens", new Vector3(0, 0.013f, -0.015f), new Vector3(0.016f, 0.004f, 0.016f), lens, Quaternion.Euler(90, 0, 0));
            map["Webcam"] = webcam;

            var keyboard = Group(parent, "Keyboard", new Vector3(-0.08f, Desk, -0.11f));
            Box(keyboard, "Base", new Vector3(0, 0.007f, 0), new Vector3(0.36f, 0.014f, 0.12f), grey);
            for (var row = 0; row < 4; row++)
                for (var col = 0; col < 13; col++)
                    Box(keyboard, $"Key{row}_{col}", new Vector3(-0.155f + col * 0.026f, 0.017f, -0.04f + row * 0.026f), new Vector3(0.021f, 0.008f, 0.021f), key);
            Box(keyboard, "Space", new Vector3(0, 0.017f, -0.066f + 0.0f), new Vector3(0.13f, 0.008f, 0.018f), key);
            map["Keyboard"] = keyboard;

            var mouse = Group(parent, "Mouse", new Vector3(0.17f, Desk, -0.11f));
            Ball(mouse, "Shell", new Vector3(0, 0.015f, 0), new Vector3(0.055f, 0.03f, 0.09f), light);
            Box(mouse, "Wheel", new Vector3(0, 0.03f, -0.02f), new Vector3(0.006f, 0.008f, 0.014f), black);
            map["Mouse"] = mouse;

            var mic = Group(parent, "Microphone", new Vector3(-0.47f, Desk, -0.1f));
            Cylinder(mic, "Base", new Vector3(0, 0.005f, 0), new Vector3(0.07f, 0.01f, 0.07f), black);
            Cylinder(mic, "Pole", new Vector3(0, 0.08f, 0), new Vector3(0.01f, 0.15f, 0.01f), grey);
            Ball(mic, "Head", new Vector3(0, 0.175f, 0), new Vector3(0.045f, 0.06f, 0.045f), kit.Mat("Mesh", new Color(0.55f, 0.57f, 0.6f), 0.7f, 0.5f));
            map["Microphone"] = mic;

            var speakers = Group(parent, "Speakers", new Vector3(-0.38f, Desk, 0.12f));
            foreach (var x in new[] { -0.05f, 0.05f })
            {
                Box(speakers, "Cabinet" + x, new Vector3(x, 0.065f, 0), new Vector3(0.075f, 0.13f, 0.08f), black);
                Cylinder(speakers, "Woofer" + x, new Vector3(x, 0.045f, -0.041f), new Vector3(0.05f, 0.004f, 0.05f), cone, Quaternion.Euler(90, 0, 0));
                Cylinder(speakers, "Tweeter" + x, new Vector3(x, 0.1f, -0.041f), new Vector3(0.022f, 0.004f, 0.022f), cone, Quaternion.Euler(90, 0, 0));
            }
            map["Speakers"] = speakers;

            var system = Group(parent, "SystemUnit", new Vector3(0.27f, Desk, 0.1f));
            Box(system, "Tower", new Vector3(0, 0.17f, 0), new Vector3(0.17f, 0.34f, 0.32f), grey);
            Box(system, "Bezel", new Vector3(0, 0.17f, -0.161f), new Vector3(0.15f, 0.32f, 0.004f), black);
            Box(system, "Power", new Vector3(0, 0.3f, -0.164f), new Vector3(0.02f, 0.02f, 0.004f), kit.Mat("Accent", new Color(0.89f, 0.14f, 0.1f), 0, 0.6f));
            map["SystemUnit"] = system;

            var printer = Group(parent, "Printer", new Vector3(0.48f, Desk, 0.07f));
            Box(printer, "Body", new Vector3(0, 0.06f, 0), new Vector3(0.22f, 0.12f, 0.2f), light);
            Box(printer, "Top", new Vector3(0, 0.122f, 0.02f), new Vector3(0.2f, 0.006f, 0.14f), grey);
            Box(printer, "Slot", new Vector3(0, 0.04f, -0.101f), new Vector3(0.16f, 0.012f, 0.004f), black);
            map["Page"] = Box(printer, "Page", new Vector3(0, 0.04f, -0.02f), new Vector3(0.15f, 0.002f, 0.2f), paper);
            map["Printer"] = printer;

            var projector = Group(parent, "Projector", new Vector3(0.47f, Desk, -0.15f));
            Box(projector, "Body", new Vector3(0, 0.035f, 0), new Vector3(0.16f, 0.07f, 0.13f), light);
            Cylinder(projector, "Lens", new Vector3(-0.035f, 0.035f, -0.068f), new Vector3(0.045f, 0.012f, 0.045f), lens, Quaternion.Euler(90, 0, 0));
            Box(projector, "Vent", new Vector3(0.04f, 0.071f, 0), new Vector3(0.05f, 0.002f, 0.08f), grey);
            map["Projector"] = projector;
            return map;
        }
    }
}
