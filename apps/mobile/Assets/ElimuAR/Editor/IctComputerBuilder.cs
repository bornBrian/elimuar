using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using static ElimuAR.Editor.AuthoringKit;

namespace ElimuAR.Editor
{
    /// <summary>
    /// ICT activity "Inside the Computer" (Computer Science, Form 1: Computer
    /// Hardware): a tower system unit whose side panel comes off. Observe tours
    /// the motherboard, CPU and cooler, RAM, drives, graphics card, power supply
    /// and fan in step with the narration; Explore takes the eight parts out
    /// onto their trays.
    ///
    ///   ElimuAR → Build ICT: Inside the Computer
    ///   Unity.exe -batchmode -projectPath apps/mobile -executeMethod ElimuAR.Editor.IctComputerBuilder.Build -quit
    /// </summary>
    public static class IctComputerBuilder
    {
        [MenuItem("ElimuAR/Build ICT: Inside the Computer")]
        public static void Build()
        {
            var kit = new AuthoringKit("insidethecomputer", "InsideTheComputer", "InsideTheComputer_Root");
            kit.BeginScene();

            // Observe: the closed computer, then the narrated tour.
            var o = Computer(kit, kit.Observe, true);
            kit.Label("Motherboard", "Motherboard", o["Motherboard"].position + new Vector3(-0.12f, 0.17f, -0.02f));
            kit.Label("CPU", "CPU", o["CPU"].position + new Vector3(0, 0.1f, -0.12f));
            kit.Label("Cooler", "CPU cooler", o["Cooler"].position + new Vector3(0, 0.12f, -0.18f));
            kit.Label("RAM", "RAM", o["RAM"].position + new Vector3(0, 0.15f, -0.09f));
            kit.Label("SSD", "Solid-state drive", o["SSD"].position + new Vector3(-0.06f, 0.09f, -0.2f));
            kit.Label("HDD", "Hard disk drive", o["HDD"].position + new Vector3(0.05f, 0.06f, -0.22f));
            kit.Label("GPU", "Graphics card", o["GPU"].position + new Vector3(0, 0.09f, -0.14f));
            kit.Label("PSU", "Power supply unit", o["PSU"].position + new Vector3(0, 0.12f, -0.16f));
            kit.Label("Fan", "Case fan", o["Fan"].position + new Vector3(0, 0.12f, -0.06f));

            var cue = kit.Cues;
            var side = o["SidePanel"];
            kit.Pos(side, cue["open"] + 0.6f, side.localPosition);
            kit.Pos(side, cue["open"] + 2.0f, side.localPosition + new Vector3(0, 0.02f, -0.22f));
            kit.Scl(side, cue["open"] + 2.0f, Vector3.one);
            kit.Scl(side, cue["open"] + 2.6f, Vector3.zero);

            kit.Show("Motherboard", cue["motherboard"] + 0.4f, cue["cpu"] - 0.2f);
            kit.Pulse(o["Motherboard"], cue["motherboard"] + 0.6f);
            kit.Out(o["Cooler"], cue["cpu"] + 0.3f, cue["ram"] - 0.4f, new Vector3(0, 0.06f, -0.16f));
            kit.Out(o["CPU"], cue["cpu"] + 1.4f, cue["cooler"] - 0.3f, new Vector3(0, 0.02f, -0.07f));
            kit.Show("CPU", cue["cpu"] + 1.6f, cue["cooler"] - 0.2f);
            kit.Show("Cooler", cue["cooler"] + 0.2f, cue["ram"] - 0.5f);
            kit.Out(o["RAM"], cue["ram"] + 0.3f, cue["storage"] - 0.4f, new Vector3(0, 0.05f, -0.09f));
            kit.Show("RAM", cue["ram"] + 0.6f, cue["storage"] - 0.3f);
            kit.Pulse(o["RAM"], cue["volatile"] + 0.5f);
            kit.Pulse(o["RAM"], cue["volatile"] + 2.4f);
            kit.Out(o["SSD"], cue["storage"] + 0.3f, cue["gpu"] - 0.4f, new Vector3(-0.02f, 0.06f, -0.2f));
            kit.Out(o["HDD"], cue["storage"] + 2.2f, cue["gpu"] - 0.4f, new Vector3(0, 0, -0.22f));
            kit.Show("SSD", cue["storage"] + 0.8f, cue["gpu"] - 0.3f);
            kit.Show("HDD", cue["storage"] + 2.6f, cue["gpu"] - 0.3f);
            kit.Out(o["GPU"], cue["gpu"] + 0.2f, cue["psu"] - 0.3f, new Vector3(0, 0.02f, -0.14f));
            kit.Show("GPU", cue["gpu"] + 0.5f, cue["psu"] - 0.2f);
            kit.Out(o["PSU"], cue["psu"] + 0.2f, cue["fan"] - 0.3f, new Vector3(0, 0, -0.18f));
            kit.Show("PSU", cue["psu"] + 0.5f, cue["fan"] - 0.2f);
            kit.Out(o["Fan"], cue["fan"] + 0.2f, cue["outro"] - 0.3f, new Vector3(-0.03f, 0, -0.08f));
            kit.Show("Fan", cue["fan"] + 0.5f, cue["outro"] - 0.2f);
            // "Now it is your turn": every part lifts a little, together, and settles.
            foreach (var key in new[] { "Cooler", "RAM", "GPU", "PSU", "SSD", "HDD", "Fan" })
                kit.Out(o[key], cue["outro"] + 1.5f, cue["outro"] + 4.5f, new Vector3(0, 0.015f, -0.03f));
            var clip = kit.FinishTimeline();

            // Explore: the open computer, and a tray for each of the eight parts.
            var e = Computer(kit, kit.Explore, false);
            var trays = Group(kit.Explore, "Trays", Vector3.zero);
            var parts = kit.Parts;
            for (var i = 0; i < parts.Count; i++)
            {
                var key = (string)parts[i]["key"];
                var tray = kit.Tray(trays, "ScienceTray_" + key, new Vector3(-0.255f + i % 4 * 0.17f, 0, -0.33f - i / 4 * 0.19f));
                kit.Link(e[key], tray, key);
            }

            kit.Finish(clip, new Vector3(-0.55f, 0.62f, -1.05f), new Vector3(0, 0.2f, 0));
        }

        /// <summary>
        /// A tower system unit standing with its open side towards the viewer (−Z):
        /// the motherboard on the far wall with the CPU, cooler and RAM on it, the
        /// graphics card below them, the power supply at the bottom back, the drives
        /// at the bottom front, and a fan on the back wall. Each part's pivot is at
        /// its base, so on a tray it stands on the tray rather than in it.
        /// </summary>
        private static Dictionary<string, Transform> Computer(AuthoringKit kit, Transform parent, bool withSidePanel)
        {
            var map = new Dictionary<string, Transform>();
            var pc = Group(parent, "SystemUnit", Vector3.zero);

            var steel = kit.Mat("CaseSteel", new Color(0.23f, 0.25f, 0.28f), 0.6f, 0.45f);
            var inner = kit.Mat("CaseInner", new Color(0.13f, 0.14f, 0.16f), 0.3f, 0.3f);
            Box(pc, "Floor", new Vector3(0, 0.0075f, 0), new Vector3(0.44f, 0.015f, 0.21f), steel);
            Box(pc, "Roof", new Vector3(0, 0.4325f, 0), new Vector3(0.44f, 0.015f, 0.21f), steel);
            Box(pc, "FarWall", new Vector3(0, 0.22f, 0.0975f), new Vector3(0.44f, 0.44f, 0.015f), inner);
            Box(pc, "Front", new Vector3(-0.2125f, 0.22f, 0), new Vector3(0.015f, 0.44f, 0.21f), steel);
            Box(pc, "Rear", new Vector3(0.2125f, 0.22f, 0), new Vector3(0.015f, 0.44f, 0.21f), steel);
            Box(pc, "PowerButton", new Vector3(-0.222f, 0.39f, 0), new Vector3(0.006f, 0.02f, 0.02f), kit.Mat("Accent", new Color(0.89f, 0.14f, 0.1f), 0, 0.6f));
            if (withSidePanel)
            {
                var side = Group(pc, "SidePanel", new Vector3(0, 0, -0.104f));
                Box(side, "Glass", new Vector3(0, 0.22f, 0), new Vector3(0.43f, 0.43f, 0.006f), kit.Mat("SideGlass", new Color(0.55f, 0.75f, 0.95f), 0.1f, 0.85f));
                map["SidePanel"] = side;
            }

            var pcb = kit.Mat("PCB", new Color(0.09f, 0.42f, 0.26f), 0.1f, 0.5f);
            var chip = kit.Mat("Chip", new Color(0.07f, 0.07f, 0.08f), 0.2f, 0.6f);
            var gold = kit.Mat("Gold", new Color(0.86f, 0.68f, 0.25f), 0.9f, 0.6f);
            var silver = kit.Mat("Silver", new Color(0.78f, 0.8f, 0.83f), 0.85f, 0.55f);
            var black = kit.Mat("Black", new Color(0.08f, 0.08f, 0.09f), 0.2f, 0.4f);
            var fanGrey = kit.Mat("FanBlade", new Color(0.3f, 0.32f, 0.36f), 0.1f, 0.4f);

            var board = Group(pc, "Motherboard", new Vector3(0.03f, 0.08f, 0.088f));
            Box(board, "Board", new Vector3(0, 0.15f, 0), new Vector3(0.3f, 0.3f, 0.004f), pcb);
            for (var i = 0; i < 6; i++) Box(board, "Chip" + i, new Vector3(-0.11f + i * 0.035f, 0.04f, -0.003f), new Vector3(0.02f, 0.02f, 0.003f), chip);
            Box(board, "Slot", new Vector3(0, 0.09f, -0.004f), new Vector3(0.18f, 0.008f, 0.006f), black);
            Box(board, "Socket", new Vector3(-0.01f, 0.2f, -0.003f), new Vector3(0.06f, 0.06f, 0.003f), black);
            map["Motherboard"] = board;

            var cpu = Group(pc, "CPU", new Vector3(0.02f, 0.255f, 0.083f));
            Box(cpu, "Pads", new Vector3(0, 0.0225f, 0.002f), new Vector3(0.045f, 0.045f, 0.002f), gold);
            Box(cpu, "Lid", new Vector3(0, 0.0225f, -0.001f), new Vector3(0.038f, 0.038f, 0.004f), silver);
            map["CPU"] = cpu;

            var cooler = Group(pc, "Cooler", new Vector3(0.02f, 0.22f, 0.054f));
            for (var i = 0; i < 9; i++) Box(cooler, "Fin" + i, new Vector3(-0.04f + i * 0.01f, 0.055f, 0), new Vector3(0.003f, 0.11f, 0.05f), silver);
            Box(cooler, "Base", new Vector3(0, 0.055f, 0.026f), new Vector3(0.095f, 0.11f, 0.006f), kit.Mat("Copper", new Color(0.72f, 0.42f, 0.25f), 0.9f, 0.55f));
            Fan(cooler, "CoolerFan", new Vector3(0, 0.055f, -0.03f), 0.1f, Vector3.forward, black, fanGrey);
            map["Cooler"] = cooler;

            var ram = Group(pc, "RAM", new Vector3(0.11f, 0.19f, 0.07f));
            for (var i = 0; i < 2; i++)
            {
                var x = i * 0.016f;
                Box(ram, "Stick" + i, new Vector3(x, 0.066f, 0), new Vector3(0.004f, 0.133f, 0.03f), pcb);
                for (var c = 0; c < 4; c++) Box(ram, $"Chip{i}{c}", new Vector3(x - 0.003f, 0.015f + c * 0.033f, 0), new Vector3(0.002f, 0.022f, 0.016f), chip);
                Box(ram, "Contacts" + i, new Vector3(x, 0.066f, 0.0155f), new Vector3(0.0042f, 0.12f, 0.002f), gold);
            }
            map["RAM"] = ram;

            var gpu = Group(pc, "GPU", new Vector3(0.0f, 0.13f, 0.03f));
            Box(gpu, "Board", new Vector3(0, 0.012f, 0), new Vector3(0.24f, 0.004f, 0.11f), pcb);
            Box(gpu, "Shroud", new Vector3(0, -0.006f, 0), new Vector3(0.24f, 0.026f, 0.11f), black);
            Fan(gpu, "GpuFanA", new Vector3(-0.055f, -0.02f, 0), 0.08f, Vector3.up, black, fanGrey, true);
            Fan(gpu, "GpuFanB", new Vector3(0.055f, -0.02f, 0), 0.08f, Vector3.up, black, fanGrey, true);
            Box(gpu, "Bracket", new Vector3(0.122f, 0.0f, 0), new Vector3(0.004f, 0.04f, 0.11f), silver);
            map["GPU"] = gpu;

            var psu = Group(pc, "PSU", new Vector3(0.12f, 0.015f, 0.0f));
            Box(psu, "Body", new Vector3(0, 0.043f, 0), new Vector3(0.15f, 0.086f, 0.14f), black);
            Fan(psu, "PsuFan", new Vector3(0, 0.088f, 0), 0.11f, Vector3.up, kit.Mat("Grille", new Color(0.18f, 0.18f, 0.2f), 0.6f, 0.4f), fanGrey, true);
            Box(psu, "Label", new Vector3(0, 0.043f, -0.0705f), new Vector3(0.08f, 0.04f, 0.001f), kit.Mat("LabelWhite", new Color(0.92f, 0.92f, 0.9f), 0, 0.3f));
            map["PSU"] = psu;

            var hdd = Group(pc, "HDD", new Vector3(-0.12f, 0.015f, 0.0f));
            Box(hdd, "Case", new Vector3(0, 0.013f, 0), new Vector3(0.147f, 0.026f, 0.1f), silver);
            var platter = Cylinder(hdd, "Platter", new Vector3(-0.015f, 0.027f, 0), new Vector3(0.08f, 0.0015f, 0.08f), kit.Mat("Platter", new Color(0.62f, 0.64f, 0.7f), 1f, 0.9f));
            platter.gameObject.AddComponent<Spinner>().axis = Vector3.up;
            Box(hdd, "Board", new Vector3(0, -0.001f, 0), new Vector3(0.14f, 0.002f, 0.095f), pcb);
            map["HDD"] = hdd;

            var ssd = Group(pc, "SSD", new Vector3(-0.12f, 0.06f, 0.0f));
            Box(ssd, "Case", new Vector3(0, 0.0035f, 0), new Vector3(0.1f, 0.007f, 0.07f), black);
            Box(ssd, "Sticker", new Vector3(0, 0.0072f, 0), new Vector3(0.08f, 0.0004f, 0.05f), kit.Mat("Blue", new Color(0.12f, 0.35f, 0.75f), 0.2f, 0.5f));
            map["SSD"] = ssd;

            var fan = Group(pc, "Fan", new Vector3(0.19f, 0.28f, 0.0f));
            Fan(fan, "CaseFan", new Vector3(0, 0.06f, 0), 0.12f, Vector3.right, black, fanGrey);
            map["Fan"] = fan;
            return map;
        }
    }
}
