using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace ElimuAR.Editor
{
    // ICT practical "Setting Up a Computer" (Computer Studies, Form 1), life-size: a desktop system unit,
    // monitor, keyboard and mouse.
    public static class IctSetupBuilder
    {
        private const float CaseW = 0.34f, CaseH = 0.10f, CaseD = 0.32f, Feet = 0.006f;
        private const float RearZ = CaseD / 2f;
        private const float BoardSize = 0.24f;
        private static readonly Vector3 BoardAt = new Vector3(-0.035f, Feet + 0.0075f, 0.033f);

        private static AuthoringKit _kit;
        private static Dictionary<string, Material> M;

        private class Unit
        {
            public Transform Root, Lid, Board, Psu, Cpu, Ram, Ssd, CpuSlot, RamSlot, SsdSlot;
            public readonly Dictionary<string, Transform> Ports = new Dictionary<string, Transform>();
        }

        private class Plug
        {
            public Transform Root, Tail;
        }

        [MenuItem("ElimuAR/Build ICT: Setting Up a Computer")]
        public static void Build()
        {
            _kit = new AuthoringKit("settingupacomputer", "SettingUpAComputer", "SettingUpAComputer_Root");
            _kit.BeginScene();
            Materials();

            BuildObserve();
            var build = BuildBuildStep();
            var connect = BuildConnectStep();
            _kit.ExploreSteps.Add(("Build", "Build", Step("Build"), build));
            _kit.ExploreSteps.Add(("Connect", "Connect", Step("Connect"), connect));

            var clip = _kit.FinishTimeline();
            RenderStills(build, connect);
            _kit.ThumbnailSubject = _kit.Observe;
            _kit.Finish(clip, new Vector3(-0.42f, 0.5f, -0.78f), new Vector3(0.03f, 0.12f, 0.02f), 30);
        }

        private static string Step(string id)
        {
            foreach (var s in _kit.Content["exploreSteps"])
                if ((string)s["id"] == id) return (string)s["description"];
            return "";
        }

        // ---- materials --------------------------------------------------------------------

        private static void Materials()
        {
            M = new Dictionary<string, Material>
            {
                ["steel"] = _kit.Mat("CaseSteel", new Color(0.115f, 0.12f, 0.13f), 0.15f, 0.62f),
                ["steelLight"] = _kit.Mat("SteelLight", new Color(0.62f, 0.64f, 0.67f), 0.85f, 0.55f),
                ["black"] = _kit.Mat("BlackPlastic", new Color(0.05f, 0.05f, 0.055f), 0f, 0.38f),
                ["rubber"] = _kit.Mat("Rubber", new Color(0.03f, 0.03f, 0.03f), 0f, 0.15f),
                ["front"] = _kit.TexMat("CaseFront", "case_front", "case_front_n", 0.25f, 0.45f),
                ["io"] = _kit.TexMat("IOPanel", "io_panel", null, 0.75f, 0.5f),
                ["board"] = _kit.TexMat("Motherboard", "motherboard", "motherboard_n", 0.1f, 0.55f),
                ["pcbEdge"] = _kit.Mat("PcbEdge", new Color(0.09f, 0.11f, 0.12f), 0f, 0.5f),
                ["socket"] = _kit.Mat("Socket", new Color(0.17f, 0.17f, 0.18f), 0.35f, 0.5f),
                ["pins"] = _kit.Mat("SocketPins", new Color(0.58f, 0.49f, 0.3f), 0.9f, 0.6f),
                ["substrate"] = _kit.Mat("CpuSubstrate", new Color(0.09f, 0.38f, 0.25f), 0f, 0.5f),
                ["cpu"] = _kit.TexMat("CpuLid", "cpu_ihs", null, 0.88f, 0.62f),
                ["gold"] = _kit.Mat("Gold", new Color(0.84f, 0.67f, 0.34f), 1f, 0.72f),
                ["ram"] = _kit.TexMat("Ram", "ram", null, 0.05f, 0.55f),
                ["ramEdge"] = _kit.Mat("RamEdge", new Color(0.09f, 0.38f, 0.25f), 0f, 0.5f),
                ["slot"] = _kit.Mat("SlotBlack", new Color(0.06f, 0.06f, 0.065f), 0f, 0.42f),
                ["clip"] = _kit.Mat("SlotClip", new Color(0.78f, 0.79f, 0.81f), 0f, 0.4f),
                ["ssd"] = _kit.TexMat("Ssd", "ssd", null, 0.05f, 0.5f),
                ["ssdEdge"] = _kit.Mat("SsdEdge", new Color(0.07f, 0.075f, 0.08f), 0f, 0.5f),
                ["alu"] = _kit.Mat("Aluminium", new Color(0.36f, 0.38f, 0.41f), 0.8f, 0.45f),
                ["cap"] = _kit.Mat("Capacitor", new Color(0.55f, 0.56f, 0.6f), 0.9f, 0.6f),
                ["psu"] = _kit.Mat("PsuSteel", new Color(0.13f, 0.13f, 0.14f), 0.25f, 0.5f),
                ["psuFan"] = _kit.TexMat("PsuFan", "psu", "psu_n", 0.4f, 0.4f),
                ["monitor"] = _kit.Mat("MonitorBlack", new Color(0.035f, 0.035f, 0.04f), 0.05f, 0.6f),
                ["screen"] = ScreenMat(),
                ["screenOff"] = _kit.Mat("ScreenOff", new Color(0.02f, 0.02f, 0.025f), 0f, 0.93f),
                ["keycaps"] = _kit.TexMat("Keycaps", "keyboard", null, 0f, 0.3f),
                ["kbBody"] = _kit.Mat("KeyboardBody", new Color(0.06f, 0.06f, 0.065f), 0f, 0.3f),
                ["mouse"] = _kit.Mat("MouseBody", new Color(0.07f, 0.07f, 0.078f), 0f, 0.58f),
                ["cable"] = _kit.Mat("Cable", new Color(0.035f, 0.035f, 0.04f), 0f, 0.45f),
                ["cableBlue"] = _kit.Mat("CableBlue", new Color(0.12f, 0.33f, 0.78f), 0f, 0.45f),
                ["cableWhite"] = _kit.Mat("CableWhite", new Color(0.86f, 0.86f, 0.86f), 0f, 0.4f),
                ["metal"] = _kit.Mat("PlugMetal", new Color(0.8f, 0.81f, 0.82f), 1f, 0.78f),
                ["clear"] = _kit.Mat("ClearPlastic", new Color(0.82f, 0.86f, 0.9f), 0f, 0.85f),
                ["usbBlue"] = _kit.Mat("UsbBlue", new Color(0.12f, 0.36f, 0.86f), 0f, 0.5f),
                ["vgaBlue"] = _kit.Mat("VgaBlue", new Color(0.12f, 0.24f, 0.62f), 0f, 0.45f),
                ["white"] = _kit.Mat("WhitePlastic", new Color(0.9f, 0.9f, 0.88f), 0f, 0.45f),
                ["green"] = _kit.Mat("LedGreen", new Color(0.2f, 0.9f, 0.3f), 0f, 0.8f),
                ["orange"] = _kit.Mat("LedOrange", new Color(1f, 0.6f, 0.1f), 0f, 0.8f),
                ["red"] = _kit.Mat("SwitchRed", new Color(0.85f, 0.12f, 0.1f), 0f, 0.6f),
                ["jackGreen"] = _kit.Mat("JackGreen", new Color(0.35f, 0.75f, 0.3f), 0f, 0.5f),
                ["jackPink"] = _kit.Mat("JackPink", new Color(0.92f, 0.5f, 0.65f), 0f, 0.5f),
                ["jackBlue"] = _kit.Mat("JackBlue", new Color(0.35f, 0.6f, 0.9f), 0f, 0.5f),
            };
        }

        private static Material ScreenMat()
        {
            var m = _kit.TexMat("Screen", "screen", null, 0f, 0.9f);
            var tex = m.GetTexture("_BaseMap");
            m.SetTexture("_EmissionMap", tex);
            m.SetColor("_EmissionColor", Color.white * 0.75f);
            m.EnableKeyword("_EMISSION");
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
            EditorUtility.SetDirty(m);
            return m;
        }

        private static Transform RB(Transform parent, string name, Vector3 at, Vector3 size, float r, string mat, Quaternion? rot = null) =>
            _kit.RoundBox(parent, name, at, size, r, M[mat], rot);

        // ---- the system unit ------------------------------------------------------------------

        private static Vector3 BL(float px, float py, float h) =>
            new Vector3((px / 2048f - 0.5f) * BoardSize, h, (0.5f - py / 2048f) * BoardSize);

        private static float PortX(float px) => 0.15f - px / 2048f * 0.30f;
        private const float PortY = Feet + 0.05f;

        private static Unit SystemUnit(Transform parent, Vector3 at, Quaternion rot, bool lid, bool installed)
        {
            var u = new Unit { Root = AuthoringKit.Group(parent, "SystemUnit", at, rot) };
            var t = u.Root;
            _kit.ContactShadow(t, Vector3.zero, new Vector2(CaseW, CaseD), 0.55f);
            foreach (var x in new[] { -0.14f, 0.14f })
            foreach (var z in new[] { -0.13f, 0.13f })
                RB(t, "Foot", new Vector3(x, Feet / 2, z), new Vector3(0.03f, Feet, 0.03f), 0.004f, "rubber");
            RB(t, "Floor", new Vector3(0, Feet + 0.002f, 0), new Vector3(CaseW, 0.004f, CaseD), 0.002f, "steel");
            RB(t, "SideLeft", new Vector3(-CaseW / 2 + 0.002f, Feet + CaseH / 2, 0), new Vector3(0.004f, CaseH, CaseD), 0.0015f, "steel");
            RB(t, "SideRight", new Vector3(CaseW / 2 - 0.002f, Feet + CaseH / 2, 0), new Vector3(0.004f, CaseH, CaseD), 0.0015f, "steel");
            RB(t, "Bezel", new Vector3(0, Feet + CaseH / 2, -CaseD / 2 - 0.006f), new Vector3(CaseW + 0.006f, CaseH + 0.004f, 0.016f), 0.005f, "black");
            AuthoringKit.Decal(t, "FrontPanel", new Vector3(0, Feet + CaseH / 2, -CaseD / 2 - 0.0141f), new Vector2(CaseW - 0.004f, CaseH - 0.006f), M["front"], Quaternion.identity);
            RB(t, "RearPanel", new Vector3(0, Feet + CaseH / 2, RearZ - 0.002f), new Vector3(CaseW, CaseH, 0.004f), 0.0015f, "steel");
            AuthoringKit.Decal(t, "IOPlate", new Vector3(0, Feet + 0.045f, RearZ + 0.0002f), new Vector2(0.30f, 0.056f), M["io"], Quaternion.Euler(0, 180, 0));
            if (lid)
                u.Lid = RB(t, "Lid", new Vector3(0, Feet + CaseH + 0.002f, 0), new Vector3(CaseW + 0.004f, 0.004f, CaseD + 0.004f), 0.002f, "steel");

            var fan = AuthoringKit.Group(t, "FrontFan", new Vector3(-0.1f, Feet + 0.05f, -0.135f));
            AuthoringKit.Fan(fan, "Fan", Vector3.zero, 0.08f, Vector3.forward, M["black"], M["black"]);

            Ports(u);
            Motherboard(u, installed);

            u.Psu = AuthoringKit.Group(t, "PSU", new Vector3(0.11f, Feet + 0.0415f, 0.083f));
            RB(u.Psu, "Box", Vector3.zero, new Vector3(0.1f, 0.075f, 0.15f), 0.004f, "psu");
            AuthoringKit.Decal(u.Psu, "FanGrille", new Vector3(0, 0.0377f, -0.01f), new Vector2(0.088f, 0.088f), M["psuFan"]);
            RB(u.Psu, "Label", new Vector3(-0.0502f, 0, -0.02f), new Vector3(0.0008f, 0.05f, 0.07f), 0.0003f, "white");

            var bundle = new GameObject("PowerBundle", typeof(MeshFilter), typeof(MeshRenderer)).transform;
            bundle.SetParent(t, false);
            bundle.GetComponent<MeshRenderer>().sharedMaterial = M["cable"];
            var from = AuthoringKit.Group(u.Psu, "BundleOut", new Vector3(-0.05f, 0.015f, -0.04f), Quaternion.LookRotation(Vector3.left));
            var into = AuthoringKit.Group(u.Board, "AtxPlug", BL(90, 900, 0.012f), Quaternion.LookRotation(Vector3.up));
            var cable = bundle.gameObject.AddComponent<Cable>();
            cable.from = from;
            cable.to = into;
            cable.radius = 0.0055f;
            cable.slack = 0.15f;
            return u;
        }

        private static void Motherboard(Unit u, bool installed)
        {
            var b = u.Board = AuthoringKit.Group(u.Root, "Motherboard", BoardAt, Quaternion.Euler(0, 180, 0));
            RB(b, "Pcb", Vector3.zero, new Vector3(BoardSize, 0.0016f, BoardSize), 0.0008f, "pcbEdge");
            AuthoringKit.Decal(b, "Print", new Vector3(0, 0.00082f, 0), new Vector2(BoardSize - 0.001f, BoardSize - 0.001f), M["board"]);

            RB(b, "SocketFrame", BL(770, 730, 0.0028f), new Vector3(0.05f, 0.004f, 0.05f), 0.0015f, "socket");
            RB(b, "SocketPins", BL(770, 730, 0.0049f), new Vector3(0.04f, 0.0006f, 0.04f), 0.0004f, "pins");
            RB(b, "Lever", BL(770, 730, 0.004f) + new Vector3(0.029f, 0, 0), new Vector3(0.0018f, 0.0018f, 0.05f), 0.0008f, "steelLight");
            u.CpuSlot = AuthoringKit.Group(b, "CpuSlot", BL(770, 730, 0.0058f));

            foreach (var (name, px) in new[] { ("Dimm1", 1203f), ("Dimm2", 1293f) })
            {
                var at = BL(px, 770, 0.0053f);
                RB(b, name, at, new Vector3(0.0075f, 0.009f, 0.137f), 0.0012f, "slot");
                RB(b, name + "ClipA", at + new Vector3(0, 0.001f, 0.0715f), new Vector3(0.0085f, 0.011f, 0.006f), 0.0012f, "clip");
                RB(b, name + "ClipB", at + new Vector3(0, 0.001f, -0.0715f), new Vector3(0.0085f, 0.011f, 0.006f), 0.0012f, "clip");
            }
            u.RamSlot = AuthoringKit.Group(b, "RamSlot", BL(1203, 770, 0.0216f));

            var m2 = BL(530, 1235, 0.0031f);
            RB(b, "M2Connector", m2, new Vector3(0.007f, 0.0045f, 0.024f), 0.001f, "slot");
            AuthoringKit.Cylinder(b, "M2Standoff", m2 + new Vector3(0.0835f, 0, 0), new Vector3(0.006f, 0.005f, 0.006f), M["gold"]);
            u.SsdSlot = AuthoringKit.Group(b, "SsdSlot", m2 + new Vector3(0.0435f, 0.0016f, 0));

            Heatsink(b, "VrmA", BL(770, 455, 0.0008f), new Vector3(0.062f, 0.013f, 0.012f), true);
            Heatsink(b, "VrmB", BL(470, 730, 0.0008f), new Vector3(0.012f, 0.013f, 0.062f), false);
            Heatsink(b, "Chipset", BL(1640, 1620, 0.0008f), new Vector3(0.032f, 0.009f, 0.032f), true);

            var pcie = BL(880, 1462, 0.0061f);
            RB(b, "PcieSlot", pcie, new Vector3(0.089f, 0.0105f, 0.0072f), 0.0008f, "slot");
            RB(b, "PcieArmourA", pcie + new Vector3(0, 0.0003f, 0.0039f), new Vector3(0.089f, 0.0106f, 0.0006f), 0.0002f, "steelLight");
            RB(b, "PcieArmourB", pcie + new Vector3(0, 0.0003f, -0.0039f), new Vector3(0.089f, 0.0106f, 0.0006f), 0.0002f, "steelLight");
            RB(b, "PcieLatch", pcie + new Vector3(-0.047f, 0.001f, 0), new Vector3(0.006f, 0.012f, 0.008f), 0.001f, "clip");
            foreach (var y in new[] { 1240f, 1330f })
                RB(b, "Sata", BL(1930, y, 0.0045f), new Vector3(0.0065f, 0.0072f, 0.0125f), 0.0008f, "black");
            RB(b, "IoUsbStack", BL(300, 1885, 0.0088f), new Vector3(0.016f, 0.0158f, 0.02f), 0.0008f, "steelLight");
            RB(b, "IoLanStack", BL(560, 1885, 0.0098f), new Vector3(0.017f, 0.0178f, 0.02f), 0.0008f, "steelLight");
            RB(b, "IoVideo", BL(860, 1885, 0.0068f), new Vector3(0.034f, 0.0118f, 0.02f), 0.0008f, "steelLight");
            RB(b, "IoAudio", BL(1200, 1885, 0.0108f), new Vector3(0.013f, 0.0198f, 0.02f), 0.0012f, "black");
            for (var i = 0; i < 7; i++)
                AuthoringKit.Cylinder(b, "Cap" + i, BL(560 + i * 62, 1010, 0.0052f), new Vector3(0.0065f, 0.009f, 0.0065f), M["cap"]);
            RB(b, "AtxSocket", BL(90, 900, 0.0058f), new Vector3(0.009f, 0.01f, 0.052f), 0.001f, "white");

            u.Cpu = Cpu(installed ? u.CpuSlot : b, installed ? Vector3.zero : new Vector3(0, 0.05f, 0));
            u.Ram = Ram(installed ? u.RamSlot : b, Vector3.zero);
            u.Ssd = Ssd(installed ? u.SsdSlot : b, Vector3.zero);
            if (installed)
            {
                u.Cpu.SetParent(b, true);
                u.Ram.SetParent(b, true);
                u.Ssd.SetParent(b, true);
            }
        }

        /// <summary>An aluminium heatsink: a base and a row of thin fins, as light catches them on a real board.</summary>
        private static void Heatsink(Transform parent, string name, Vector3 at, Vector3 size, bool finsAlongX)
        {
            var h = AuthoringKit.Group(parent, name, at);
            RB(h, "Base", new Vector3(0, 0.0015f, 0), new Vector3(size.x, 0.003f, size.z), 0.0008f, "alu");
            var length = finsAlongX ? size.x : size.z;
            var count = Mathf.Max(4, Mathf.RoundToInt(length / 0.0045f));
            for (var i = 0; i < count; i++)
            {
                var o = -length / 2 + (i + 0.5f) * length / count;
                var finSize = finsAlongX ? new Vector3(0.0014f, size.y - 0.003f, size.z) : new Vector3(size.x, size.y - 0.003f, 0.0014f);
                var pos = finsAlongX ? new Vector3(o, 0.003f + finSize.y / 2, 0) : new Vector3(0, 0.003f + finSize.y / 2, o);
                RB(h, "Fin" + i, pos, finSize, 0.0005f, "alu");
            }
        }

        private static Transform Cpu(Transform parent, Vector3 at)
        {
            var c = AuthoringKit.Group(parent, "CPU", at);
            RB(c, "Substrate", new Vector3(0, 0.0006f, 0), new Vector3(0.0375f, 0.0012f, 0.0375f), 0.0006f, "substrate");
            RB(c, "Lid", new Vector3(0, 0.0026f, 0), new Vector3(0.0305f, 0.0028f, 0.0305f), 0.0012f, "steelLight");
            AuthoringKit.Decal(c, "LidPrint", new Vector3(0, 0.00402f, 0), new Vector2(0.03f, 0.03f), M["cpu"]);
            RB(c, "Triangle", new Vector3(-0.0165f, 0.00125f, -0.0165f), new Vector3(0.0035f, 0.0003f, 0.0035f), 0.0002f, "gold", Quaternion.Euler(0, 45, 0));
            return c;
        }

        private static Transform Ram(Transform parent, Vector3 at)
        {
            var r = AuthoringKit.Group(parent, "RAM", at);
            RB(r, "Pcb", Vector3.zero, new Vector3(0.0013f, 0.031f, 0.1335f), 0.0004f, "ramEdge");
            AuthoringKit.Decal(r, "FaceA", new Vector3(-0.00068f, 0, 0), new Vector2(0.1335f, 0.031f), M["ram"], Quaternion.Euler(0, 90, 0));
            AuthoringKit.Decal(r, "FaceB", new Vector3(0.00068f, 0, 0), new Vector2(0.1335f, 0.031f), M["ram"], Quaternion.Euler(0, -90, 0));
            return r;
        }

        private static Transform Ssd(Transform parent, Vector3 at)
        {
            var s = AuthoringKit.Group(parent, "SSD", at);
            RB(s, "Pcb", Vector3.zero, new Vector3(0.08f, 0.0012f, 0.022f), 0.0004f, "ssdEdge");
            AuthoringKit.Decal(s, "Print", new Vector3(0, 0.00062f, 0), new Vector2(0.08f, 0.022f), M["ssd"]);
            return s;
        }

        private static void Ports(Unit u)
        {
            var t = u.Root;
            var face = RearZ + 0.001f;
            Transform Port(string key, float px, float depth)
            {
                var p = AuthoringKit.Group(t, "Port" + key, new Vector3(PortX(px), PortY, face));
                u.Ports[key] = AuthoringKit.Group(p, "Target" + key, new Vector3(0, 0, -depth), Quaternion.Euler(0, 180, 0));
                return p;
            }

            var power = Port("Power", 150, 0.003f);
            RB(power, "Frame", new Vector3(0, -0.004f, 0.002f), new Vector3(0.031f, 0.025f, 0.006f), 0.002f, "black");
            RB(power, "Recess", new Vector3(0, -0.004f, 0.0045f), new Vector3(0.025f, 0.019f, 0.002f), 0.001f, "rubber");
            foreach (var x in new[] { -0.006f, 0f, 0.006f })
                RB(power, "Pin", new Vector3(x, x == 0 ? 0.0f : -0.007f, 0.004f), new Vector3(0.0016f, 0.004f, 0.004f), 0.0003f, "metal");
            u.Ports["Power"].localPosition = new Vector3(0, -0.004f, 0.0055f);

            var vga = AuthoringKit.Group(t, "PortVGA", new Vector3(PortX(470), PortY, face));
            RB(vga, "Shell", new Vector3(0, 0, 0.002f), new Vector3(0.031f, 0.0125f, 0.004f), 0.002f, "metal");
            RB(vga, "Body", new Vector3(0, 0, 0.0035f), new Vector3(0.024f, 0.0085f, 0.003f), 0.0015f, "vgaBlue");

            var hdmi = Port("HDMI", 700, 0.009f);
            RB(hdmi, "Shell", new Vector3(0, 0, 0.002f), new Vector3(0.0155f, 0.0062f, 0.006f), 0.0008f, "metal");
            RB(hdmi, "Mouth", new Vector3(0, 0, 0.0046f), new Vector3(0.0135f, 0.0042f, 0.002f), 0.0006f, "rubber");

            foreach (var (key, px) in new[] { ("USB1", 960f), ("USB2", 1140f) })
            {
                var usb = Port(key, px, 0.009f);
                RB(usb, "Shell", new Vector3(0, 0, 0.002f), new Vector3(0.0135f, 0.0058f, 0.006f), 0.0005f, "metal");
                RB(usb, "Mouth", new Vector3(0, 0, 0.0046f), new Vector3(0.0118f, 0.0044f, 0.002f), 0.0004f, "rubber");
                RB(usb, "Tongue", new Vector3(0, 0.001f, 0.0043f), new Vector3(0.0108f, 0.0017f, 0.003f), 0.0003f, "usbBlue");
            }

            var lan = Port("LAN", 1390, 0.011f);
            RB(lan, "Shell", new Vector3(0, 0, 0.002f), new Vector3(0.0165f, 0.0145f, 0.007f), 0.0008f, "metal");
            RB(lan, "Mouth", new Vector3(0, -0.0005f, 0.005f), new Vector3(0.0125f, 0.0105f, 0.002f), 0.0006f, "rubber");
            RB(lan, "LedA", new Vector3(-0.0055f, 0.0062f, 0.0056f), new Vector3(0.0025f, 0.0015f, 0.001f), 0.0003f, "green");
            RB(lan, "LedB", new Vector3(0.0055f, 0.0062f, 0.0056f), new Vector3(0.0025f, 0.0015f, 0.001f), 0.0003f, "orange");

            var audio = AuthoringKit.Group(t, "PortAudio", new Vector3(PortX(1640), PortY, face));
            var jacks = new[] { ("jackBlue", 0.009f), ("jackGreen", 0f), ("jackPink", -0.009f) };
            foreach (var (mat, y) in jacks)
                AuthoringKit.Cylinder(audio, "Jack", new Vector3(0, y, 0.002f), new Vector3(0.0075f, 0.004f, 0.0075f), M[mat], Quaternion.Euler(90, 0, 0));
        }

        // ---- devices -----------------------------------------------------------------------

        private static Transform Monitor(Transform parent, Vector3 at, out Transform screenOff, out Transform hdmiOut)
        {
            var m = AuthoringKit.Group(parent, "Monitor", at);
            _kit.ContactShadow(m, new Vector3(0, 0, 0.02f), new Vector2(0.23f, 0.17f), 0.5f);
            _kit.ContactShadow(m, new Vector3(0, 0, 0.04f), new Vector2(0.5f, 0.1f), 0.18f);
            RB(m, "Base", new Vector3(0, 0.005f, 0.02f), new Vector3(0.23f, 0.01f, 0.17f), 0.005f, "monitor");
            RB(m, "Neck", new Vector3(0, 0.09f, 0.05f), new Vector3(0.045f, 0.17f, 0.024f), 0.006f, "monitor");
            RB(m, "Back", new Vector3(0, 0.29f, 0.048f), new Vector3(0.3f, 0.18f, 0.03f), 0.014f, "monitor");
            RB(m, "Panel", new Vector3(0, 0.3f, 0.03f), new Vector3(0.545f, 0.325f, 0.022f), 0.004f, "monitor");
            AuthoringKit.Decal(m, "Screen", new Vector3(0, 0.305f, 0.0188f), new Vector2(0.53f, 0.298f), M["screen"], Quaternion.identity);
            screenOff = AuthoringKit.Decal(m, "ScreenOff", new Vector3(0, 0.305f, 0.0186f), new Vector2(0.53f, 0.298f), M["screenOff"], Quaternion.identity);
            RB(m, "Led", new Vector3(0.24f, 0.142f, 0.0185f), new Vector3(0.003f, 0.002f, 0.001f), 0.0004f, "green");
            hdmiOut = AuthoringKit.Group(m, "HdmiOut", new Vector3(0.06f, 0.21f, 0.064f), Quaternion.LookRotation(new Vector3(0, -0.6f, 1)));
            return m;
        }

        private static Transform Keyboard(Transform parent, Vector3 at, out Transform cableOut)
        {
            var k = AuthoringKit.Group(parent, "Keyboard", at);
            _kit.ContactShadow(k, Vector3.zero, new Vector2(0.44f, 0.138f), 0.5f);
            RB(k, "Body", new Vector3(0, 0.0085f, 0), new Vector3(0.44f, 0.017f, 0.138f), 0.006f, "kbBody");
            RB(k, "Plate", new Vector3(0, 0.0172f, -0.002f), new Vector3(0.432f, 0.0012f, 0.132f), 0.0005f, "rubber");
            _kit.Keycaps(k, "Keycaps", new Vector3(0, 0.0178f, -0.002f), new Vector2(0.43f, 0.131f), new Vector2(2048, 680), KeyRects(), 0.0068f, M["keycaps"]);
            cableOut = AuthoringKit.Group(k, "UsbOut", new Vector3(-0.12f, 0.012f, 0.069f), Quaternion.LookRotation(Vector3.forward));
            return k;
        }

        private static Transform Mouse(Transform parent, Vector3 at, out Transform cableOut)
        {
            var m = AuthoringKit.Group(parent, "Mouse", at);
            _kit.ContactShadow(m, Vector3.zero, new Vector2(0.062f, 0.112f), 0.55f);
            RB(m, "Skirt", new Vector3(0, 0.0035f, 0), new Vector3(0.06f, 0.007f, 0.108f), 0.003f, "rubber");
            var body = Dome(m, "Body", new Vector3(0, 0.005f, -0.004f), new Vector3(0.062f, 0.064f, 0.116f), M["mouse"]);
            body.localRotation = Quaternion.Euler(-4, 0, 0);
            RB(m, "Seam", new Vector3(0, 0.0352f, 0.03f), new Vector3(0.0008f, 0.0008f, 0.046f), 0.0002f, "rubber", Quaternion.Euler(12, 0, 0));
            RB(m, "WheelWell", new Vector3(0, 0.0348f, 0.026f), new Vector3(0.0105f, 0.003f, 0.02f), 0.0012f, "rubber", Quaternion.Euler(12, 0, 0));
            AuthoringKit.Cylinder(m, "Wheel", new Vector3(0, 0.0362f, 0.026f), new Vector3(0.016f, 0.0065f, 0.016f), M["black"], Quaternion.Euler(0, 0, 90));
            cableOut = AuthoringKit.Group(m, "UsbOut", new Vector3(0, 0.012f, 0.057f), Quaternion.LookRotation(Vector3.forward));
            return m;
        }

        private static Transform PowerStrip(Transform parent, Vector3 at, out Transform cableOut)
        {
            var s = AuthoringKit.Group(parent, "PowerStrip", at);
            _kit.ContactShadow(s, Vector3.zero, new Vector2(0.06f, 0.24f), 0.45f);
            RB(s, "Body", new Vector3(0, 0.017f, 0), new Vector3(0.06f, 0.034f, 0.24f), 0.006f, "white");
            for (var i = 0; i < 3; i++)
            {
                RB(s, "Socket" + i, new Vector3(0, 0.0343f, -0.06f + i * 0.055f), new Vector3(0.04f, 0.0008f, 0.04f), 0.004f, "rubber");
            }
            RB(s, "Switch", new Vector3(0, 0.035f, 0.1f), new Vector3(0.016f, 0.006f, 0.022f), 0.002f, "red");
            cableOut = AuthoringKit.Group(s, "Out", new Vector3(0.03f, 0.017f, -0.06f), Quaternion.LookRotation(Vector3.right));
            return s;
        }

        private static Transform NetworkPoint(Transform parent, Vector3 at, out Transform cableOut)
        {
            var n = AuthoringKit.Group(parent, "NetworkSwitch", at);
            _kit.ContactShadow(n, Vector3.zero, new Vector2(0.13f, 0.085f), 0.45f);
            RB(n, "Body", new Vector3(0, 0.016f, 0), new Vector3(0.13f, 0.032f, 0.085f), 0.004f, "white");
            for (var i = 0; i < 5; i++)
            {
                RB(n, "Port" + i, new Vector3(-0.05f + i * 0.025f, 0.016f, -0.0428f), new Vector3(0.014f, 0.012f, 0.002f), 0.0008f, "rubber");
                RB(n, "Led" + i, new Vector3(-0.05f + i * 0.025f, 0.027f, -0.0428f), new Vector3(0.004f, 0.002f, 0.001f), 0.0004f, i < 3 ? "green" : "orange");
            }
            cableOut = AuthoringKit.Group(n, "Out", new Vector3(0.05f, 0.016f, -0.045f), Quaternion.LookRotation(Vector3.back));
            return n;
        }

        /// <summary>The key rectangles of the keyboard texture (as textures.py draws them), in texture pixels.</summary>
        private static IEnumerable<Rect> KeyRects()
        {
            const float u = 104, gap = 10, top = 30;
            var rows = new[]
            {
                new float[] { 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1 },
                new float[] { 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2 },
                new float[] { 1.5f, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5f },
                new float[] { 1.8f, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.2f },
                new float[] { 2.3f, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.7f },
                new float[] { 1.4f, 1.2f, 1.3f, 6.6f, 1.3f, 1.2f, 1.4f },
            };
            for (var r = 0; r < rows.Length; r++)
            {
                var x = 30f;
                var y = top + r * (u + gap) + (r > 0 ? 16 : 0);
                foreach (var span in rows[r])
                {
                    var w = u * span + gap * (span - 1);
                    yield return new Rect(x, y, w, u);
                    x += w + gap;
                }
            }
            for (var r = 0; r < 4; r++)
            for (var c = 0; c < 3; c++)
                yield return new Rect(1640 + c * (u + gap), top + (r + 1) * (u + gap) + 16, u, u);
        }

        /// <summary>The upper half of an egg shape with a flat bottom: a mouse body.</summary>
        private static Transform Dome(Transform parent, string name, Vector3 at, Vector3 size, Material mat)
        {
            const string path = "Assets/ElimuARContent/SettingUpAComputer/Meshes/dome.asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if (mesh == null)
            {
                const int around = 40, down = 16;
                var verts = new List<Vector3>();
                var norms = new List<Vector3>();
                var tris = new List<int>();
                for (var i = 0; i <= down; i++)
                {
                    var theta = i / (float)down * Mathf.PI / 2;
                    for (var j = 0; j <= around; j++)
                    {
                        var phi = j / (float)around * Mathf.PI * 2;
                        var n = new Vector3(Mathf.Sin(theta) * Mathf.Cos(phi), Mathf.Cos(theta), Mathf.Sin(theta) * Mathf.Sin(phi));
                        verts.Add(n * 0.5f);
                        norms.Add(n);
                    }
                }
                for (var i = 0; i < down; i++)
                for (var j = 0; j < around; j++)
                {
                    var a = i * (around + 1) + j;
                    var b = a + around + 1;
                    tris.AddRange(new[] { a, a + 1, b, b, a + 1, b + 1 });
                }
                var center = verts.Count;
                verts.Add(Vector3.zero);
                norms.Add(Vector3.down);
                var ring = down * (around + 1);
                for (var j = 0; j < around; j++)
                {
                    verts.Add(verts[ring + j]);
                    norms.Add(Vector3.down);
                }
                for (var j = 0; j < around; j++)
                    tris.AddRange(new[] { center, center + 1 + j, center + 1 + (j + 1) % around });
                mesh = new Mesh { name = "dome" };
                mesh.SetVertices(verts);
                mesh.SetNormals(norms);
                mesh.SetTriangles(tris, 0);
                mesh.RecalculateBounds();
                AssetDatabase.CreateAsset(mesh, path);
            }
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            go.transform.localScale = size;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            return go.transform;
        }

        // ---- plugs (along +z, the origin at the tip) ---------------------------------------------

        private static Plug MakePlug(Transform parent, string name, string kind, Vector3 at, Quaternion rot)
        {
            var p = new Plug { Root = AuthoringKit.Group(parent, name, at, rot) };
            var t = p.Root;
            float tail;
            switch (kind)
            {
                case "hdmi":
                    RB(t, "Tip", new Vector3(0, 0, -0.0055f), new Vector3(0.014f, 0.0045f, 0.011f), 0.0007f, "metal");
                    RB(t, "Body", new Vector3(0, 0, -0.025f), new Vector3(0.021f, 0.0105f, 0.028f), 0.003f, "black");
                    AuthoringKit.Cylinder(t, "Relief", new Vector3(0, 0, -0.045f), new Vector3(0.0075f, 0.012f, 0.0075f), M["black"], Quaternion.Euler(90, 0, 0));
                    tail = -0.051f;
                    break;
                case "usb":
                    RB(t, "Tip", new Vector3(0, 0, -0.006f), new Vector3(0.012f, 0.0045f, 0.012f), 0.0004f, "metal");
                    RB(t, "Tongue", new Vector3(0, -0.0009f, -0.004f), new Vector3(0.0102f, 0.0016f, 0.0082f), 0.0003f, "white");
                    RB(t, "Body", new Vector3(0, 0, -0.027f), new Vector3(0.0165f, 0.0085f, 0.03f), 0.0025f, "black");
                    AuthoringKit.Cylinder(t, "Relief", new Vector3(0, 0, -0.047f), new Vector3(0.0058f, 0.01f, 0.0058f), M["black"], Quaternion.Euler(90, 0, 0));
                    tail = -0.052f;
                    break;
                case "rj45":
                    RB(t, "Head", new Vector3(0, 0, -0.011f), new Vector3(0.0118f, 0.0082f, 0.022f), 0.0008f, "clear");
                    RB(t, "Contacts", new Vector3(0, 0.0039f, -0.004f), new Vector3(0.0085f, 0.0006f, 0.004f), 0.0002f, "gold");
                    RB(t, "Clip", new Vector3(0, 0.0052f, -0.013f), new Vector3(0.0062f, 0.0012f, 0.013f), 0.0004f, "clear", Quaternion.Euler(-8, 0, 0));
                    RB(t, "Boot", new Vector3(0, 0, -0.031f), new Vector3(0.0135f, 0.0105f, 0.018f), 0.003f, "cableBlue");
                    tail = -0.041f;
                    break;
                default:
                    RB(t, "Body", new Vector3(0, 0, -0.019f), new Vector3(0.0245f, 0.0175f, 0.038f), 0.004f, "black");
                    RB(t, "Face", new Vector3(0, 0, -0.0002f), new Vector3(0.019f, 0.012f, 0.0006f), 0.001f, "rubber");
                    AuthoringKit.Cylinder(t, "Relief", new Vector3(0, 0, -0.045f), new Vector3(0.0095f, 0.015f, 0.0095f), M["black"], Quaternion.Euler(90, 0, 0));
                    tail = -0.053f;
                    break;
            }
            p.Tail = AuthoringKit.Group(t, "Tail", new Vector3(0, 0, tail), Quaternion.LookRotation(Vector3.back));
            return p;
        }

        private static void Wire(Transform parent, string name, Transform from, Transform to, string mat, float radius = 0.0025f, float slack = 0.25f)
        {
            var go = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            go.transform.SetParent(parent, false);
            go.GetComponent<MeshRenderer>().sharedMaterial = M[mat];
            var c = go.AddComponent<Cable>();
            c.from = from;
            c.to = to;
            c.radius = radius;
            c.slack = slack;
        }

        private static readonly (string key, string kind, string port, string cable)[] Plugs =
        {
            ("HDMI", "hdmi", "HDMI", "cable"),
            ("KeyboardUSB", "usb", "USB1", "cable"),
            ("MouseUSB", "usb", "USB2", "cable"),
            ("Ethernet", "rj45", "LAN", "cableBlue"),
            ("Power", "power", "Power", "cable"),
        };

        private static Dictionary<string, Transform> Devices(Transform parent, Vector3 monitorAt, Vector3 keyboardAt, Vector3 mouseAt,
            Vector3 stripAt, Vector3 networkAt, out Transform screenOff, out Transform monitor, out Transform keyboard, out Transform mouse)
        {
            monitor = Monitor(parent, monitorAt, out screenOff, out var hdmiOut);
            keyboard = Keyboard(parent, keyboardAt, out var kbOut);
            mouse = Mouse(parent, mouseAt, out var mouseOut);
            PowerStrip(parent, stripAt, out var stripOut);
            NetworkPoint(parent, networkAt, out var netOut);
            return new Dictionary<string, Transform>
            {
                ["HDMI"] = hdmiOut, ["KeyboardUSB"] = kbOut, ["MouseUSB"] = mouseOut, ["Ethernet"] = netOut, ["Power"] = stripOut,
            };
        }

        // ---- Observe ----------------------------------------------------------------------------

        private static void BuildObserve()
        {
            var o = _kit.Observe;
            var unitAt = new Vector3(-0.17f, 0, 0.05f);
            var u = SystemUnit(o, unitAt, Quaternion.identity, true, true);
            var outs = Devices(o, new Vector3(0.24f, 0, 0.11f), new Vector3(0.02f, 0, -0.21f), new Vector3(0.33f, 0, -0.21f),
                new Vector3(-0.47f, 0, -0.02f), new Vector3(-0.42f, 0, 0.24f), out var screenOff, out var monitor, out var keyboard, out var mouse);

            var plugs = new Dictionary<string, Transform>();
            foreach (var (key, kind, port, cable) in Plugs)
            {
                var target = u.Ports[port];
                var plug = MakePlug(target.parent, key, kind, target.localPosition, target.localRotation);
                plugs[key] = plug.Root;
                Wire(o, key + "Cable", outs[key], plug.Tail, cable, key == "Power" ? 0.0035f : 0.0025f);
            }

            var cue = _kit.Cues;
            var turned = Quaternion.Euler(0, 180, 0);

            _kit.Callout("Monitor", "Monitor", monitor, new Vector3(0.2f, 0.42f, 0.019f), new Vector3(0.03f, 0.09f, -0.03f));
            _kit.Callout("Keyboard", "Keyboard", keyboard, new Vector3(0.12f, 0.025f, 0.035f), new Vector3(0, 0.07f, -0.02f));
            _kit.Callout("Mouse", "Mouse", mouse, new Vector3(0, 0.035f, 0.005f), new Vector3(0.01f, 0.065f, 0));
            _kit.Callout("Unit", "System unit", u.Root, new Vector3(0.12f, Feet + CaseH + 0.004f, -0.1f), new Vector3(0.02f, 0.08f, -0.03f));
            _kit.Callout("Board", "Motherboard", u.Board, BL(1700, 1300, 0.001f), new Vector3(-0.02f, 0.1f, -0.02f));
            _kit.Callout("CPU", "CPU", u.Cpu, new Vector3(0, 0.004f, 0), new Vector3(-0.035f, 0.075f, -0.02f));
            _kit.Callout("RAM", "RAM", u.Ram, new Vector3(0, 0.0155f, 0.035f), new Vector3(0.03f, 0.07f, -0.02f));
            _kit.Callout("SSD", "Storage drive", u.Ssd, new Vector3(0.02f, 0.0006f, 0), new Vector3(0.0f, 0.085f, -0.04f));
            _kit.Callout("PSU", "Power supply unit", u.Psu, new Vector3(0, 0.0375f, 0.03f), new Vector3(0.01f, 0.085f, 0));

            _kit.Callout("PortHDMI", "HDMI", u.Ports["HDMI"].parent, new Vector3(0, 0, 0.004f), new Vector3(0, 0.045f, 0.03f));
            _kit.Callout("PortUSB", "USB", u.Ports["USB1"].parent, new Vector3(0, 0, 0.004f), new Vector3(0, 0.08f, 0.03f));
            _kit.Callout("PortLAN", "LAN", u.Ports["LAN"].parent, new Vector3(0, 0, 0.006f), new Vector3(0, 0.045f, 0.03f));
            _kit.Callout("PortPower", "Power", u.Ports["Power"].parent, new Vector3(0, -0.004f, 0.004f), new Vector3(0, 0.08f, 0.03f));

            _kit.Show("Monitor", cue["monitor"] + 0.3f, cue["input"] - 0.2f);
            _kit.Pulse(monitor, cue["monitor"] + 0.6f, 0.03f);
            _kit.Show("Keyboard", cue["input"] + 0.3f, cue["unit"] - 0.2f);
            _kit.Show("Mouse", cue["input"] + 1.0f, cue["unit"] - 0.2f);
            _kit.Pulse(keyboard, cue["input"] + 0.6f, 0.04f);
            _kit.Pulse(mouse, cue["input"] + 1.3f, 0.06f);

            _kit.Show("Unit", cue["unit"] + 0.3f, cue["board"] - 0.2f);
            var lidHome = u.Lid.localPosition;
            _kit.Pos(u.Lid, cue["unit"] + 3.0f, lidHome);
            _kit.Pos(u.Lid, cue["unit"] + 4.2f, lidHome + new Vector3(0, 0.12f, 0));
            _kit.Pos(u.Lid, cue["unit"] + 5.2f, lidHome + new Vector3(0, 0.14f, 0.32f));
            _kit.Scl(u.Lid, cue["unit"] + 5.2f, Vector3.one);
            _kit.Scl(u.Lid, cue["unit"] + 5.6f, Vector3.zero);

            _kit.Show("Board", cue["board"] + 0.3f, cue["cpu"] - 0.2f);
            _kit.Pulse(u.Board, cue["board"] + 0.8f, 0.02f);
            _kit.Out(u.Cpu, cue["cpu"] + 0.4f, cue["ram"] - 0.3f, new Vector3(0, 0.05f, 0));
            _kit.Show("CPU", cue["cpu"] + 0.9f, cue["ram"] - 0.4f);
            _kit.Out(u.Ram, cue["ram"] + 0.4f, cue["ssd"] - 0.3f, new Vector3(0, 0.06f, 0));
            _kit.Show("RAM", cue["ram"] + 0.9f, cue["ssd"] - 0.4f);
            _kit.Out(u.Ssd, cue["ssd"] + 0.4f, cue["psu"] - 0.3f, new Vector3(0, 0.04f, 0));
            _kit.Show("SSD", cue["ssd"] + 0.9f, cue["psu"] - 0.4f);
            _kit.Show("PSU", cue["psu"] + 0.3f, cue["back"] - 0.2f);
            _kit.Pulse(u.Psu, cue["psu"] + 0.6f, 0.04f);

            _kit.Pos(u.Lid, cue["back"] + 0.2f, lidHome + new Vector3(0, 0.14f, 0.32f));
            _kit.Scl(u.Lid, cue["back"] + 0.2f, Vector3.zero);
            _kit.Scl(u.Lid, cue["back"] + 0.5f, Vector3.one);
            _kit.Pos(u.Lid, cue["back"] + 1.5f, lidHome);
            _kit.Rot(u.Root, cue["back"] + 1.7f, Quaternion.identity);
            _kit.Rot(u.Root, cue["back"] + 2.9f, Quaternion.Euler(0, 90, 0));
            _kit.Rot(u.Root, cue["back"] + 4.1f, turned);

            _kit.Show("PortHDMI", cue["ports"] + 0.6f, cue["power"] + 6f);
            _kit.Show("PortUSB", cue["ports"] + 1.2f, cue["power"] + 6f);
            _kit.Show("PortLAN", cue["ports"] + 1.8f, cue["power"] + 6f);
            _kit.Show("PortPower", cue["ports"] + 2.4f, cue["power"] + 6f);

            var pull = new Vector3(0, 0, 0.07f);
            float[] at = { cue["connect"] + 0.6f, cue["connect"] + 3.2f, cue["connect"] + 4.6f, cue["connect"] + 7.0f, cue["power"] + 2.6f };
            for (var i = 0; i < Plugs.Length; i++)
            {
                var p = plugs[Plugs[i].key];
                var home = p.localPosition;
                var away = home + pull;
                _kit.Pos(p, 0.01f, away);
                _kit.Pos(p, at[i], away);
                _kit.Pos(p, at[i] + 1.0f, home);
            }
            _kit.Scl(screenOff, cue["power"] + 4.0f, Vector3.Scale(screenOff.localScale, Vector3.one));
            _kit.Scl(screenOff, cue["power"] + 4.6f, new Vector3(screenOff.localScale.x, 0, 1));
        }

        // ---- Explore: Build -------------------------------------------------------------------

        private static Transform BuildBuildStep()
        {
            var root = AuthoringKit.Group(_kit.Root, "SettingUpAComputerBuild", Vector3.zero);
            root.gameObject.SetActive(false);
            var u = SystemUnit(root, new Vector3(-0.02f, 0, 0.08f), Quaternion.identity, false, false);
            var trays = AuthoringKit.Group(root, "Trays", Vector3.zero);
            var cpuTray = _kit.Tray(trays, "TrayCPU", new Vector3(-0.2f, 0, -0.17f), 0.1f, 0.1f);
            var ramTray = _kit.Tray(trays, "TrayRAM", new Vector3(-0.04f, 0, -0.17f), 0.19f, 0.08f);
            var ssdTray = _kit.Tray(trays, "TraySSD", new Vector3(0.15f, 0, -0.17f), 0.13f, 0.08f);
            _kit.ContactShadow(trays, cpuTray.localPosition, new Vector2(0.1f, 0.1f), 0.35f);
            _kit.ContactShadow(trays, ramTray.localPosition, new Vector2(0.19f, 0.08f), 0.35f);
            _kit.ContactShadow(trays, ssdTray.localPosition, new Vector2(0.13f, 0.08f), 0.35f);

            Place(u.Cpu, cpuTray, new Vector3(0, 0.009f, 0), Quaternion.identity);
            Place(u.Ram, ramTray, new Vector3(0, 0.0095f, 0), Quaternion.Euler(0, 90, 90));
            Place(u.Ssd, ssdTray, new Vector3(0, 0.009f, 0), Quaternion.identity);

            _kit.LinkTo(u.Cpu, u.CpuSlot, cpuTray, "CPU", 0, null, 0.12f, new Vector3(0, 0.035f, 0));
            _kit.LinkTo(u.Ram, u.RamSlot, ramTray, "RAM", 0, null, 0.12f, new Vector3(0, 0.06f, 0));
            _kit.LinkTo(u.Ssd, u.SsdSlot, ssdTray, "SSD", 0, null, 0.12f, new Vector3(0.028f, 0.016f, 0));
            return root;
        }

        private static void Place(Transform part, Transform tray, Vector3 offset, Quaternion rotation)
        {
            part.SetParent(tray.parent.parent, true);
            part.position = tray.position + offset;
            part.rotation = rotation;
        }

        // ---- Explore: Connect -----------------------------------------------------------------

        private static Transform BuildConnectStep()
        {
            var root = AuthoringKit.Group(_kit.Root, "SettingUpAComputerConnect", Vector3.zero);
            root.gameObject.SetActive(false);
            var u = SystemUnit(root, new Vector3(-0.12f, 0, 0.06f), Quaternion.Euler(0, 180, 0), true, true);
            var outs = Devices(root, new Vector3(0.3f, 0, 0.16f), new Vector3(0.12f, 0, -0.33f), new Vector3(0.4f, 0, -0.33f),
                new Vector3(-0.47f, 0, -0.2f), new Vector3(-0.45f, 0, 0.22f), out _, out _, out _, out _);

            var parts = AuthoringKit.Group(root, "Plugs", Vector3.zero);
            for (var i = 0; i < Plugs.Length; i++)
            {
                var (key, kind, port, cable) = Plugs[i];
                var target = u.Ports[port];
                var home = new Vector3(target.position.x + (i - 2) * 0.012f, kind == "power" ? 0.009f : 0.0055f, -0.23f);
                var plug = MakePlug(parts, key, kind, home, Quaternion.identity);
                Wire(root, key + "Cable", outs[key], plug.Tail, cable, kind == "power" ? 0.0035f : 0.0025f);
                _kit.LinkTo(plug.Root, target, null, key, 0.013f, kind, 0.03f, new Vector3(0, 0, -0.06f));
            }
            return root;
        }

        // ---- stills for the web pages -----------------------------------------------------------

        private static void RenderStills(Transform build, Transform connect)
        {
            Directory.CreateDirectory("Builds/Renders");
            Still(_kit.Observe, "setup-observe", new Vector3(-0.42f, 0.5f, -0.78f), new Vector3(0.03f, 0.12f, 0.02f), 30, 1024);
            var lid = _kit.Observe.Find("SystemUnit/Lid");
            if (lid != null) lid.gameObject.SetActive(false);
            foreach (var l in _kit.Labels.Values) l.localScale = Vector3.one;
            Still(_kit.Observe, "setup-labels", new Vector3(-0.2f, 0.62f, -0.72f), new Vector3(-0.02f, 0.1f, 0.06f), 36, 1024);
            foreach (var l in _kit.Labels.Values) l.localScale = Vector3.zero;
            if (lid != null) lid.gameObject.SetActive(true);
            Still(build, "setup-build", new Vector3(0.05f, 0.42f, -0.42f), new Vector3(-0.02f, 0.02f, 0.0f), 34, 1024);
            Still(connect, "setup-connect", new Vector3(-0.05f, 0.25f, -0.5f), new Vector3(-0.1f, 0.04f, -0.08f), 32, 1024);
        }

        private static void Still(Transform subject, string file, Vector3 cameraAt, Vector3 lookAt, float fov, int size)
        {
            var hidden = new List<GameObject>();
            foreach (Transform child in _kit.Root)
                if (child.gameObject.activeSelf && child != subject) { hidden.Add(child.gameObject); child.gameObject.SetActive(false); }
            var was = subject.gameObject.activeSelf;
            subject.gameObject.SetActive(true);
            foreach (var c in subject.GetComponentsInChildren<Cable>(true)) c.Rebuild();
            foreach (var f in subject.GetComponentsInChildren<FaceViewer>(true))
            {
                var away = f.transform.position - cameraAt;
                away.y = 0;
                if (away.sqrMagnitude > 1e-6f) f.transform.rotation = Quaternion.LookRotation(away, Vector3.up);
            }
            foreach (var text in subject.GetComponentsInChildren<TMPro.TMP_Text>(true)) text.ForceMeshUpdate();
            Canvas.ForceUpdateCanvases();
            var asyncShaders = ShaderUtil.allowAsyncCompilation;
            ShaderUtil.allowAsyncCompilation = false;
            var camGo = new GameObject("StillCamera");
            var cam = camGo.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0, 0, 0, 0);
            cam.fieldOfView = fov;
            cam.nearClipPlane = 0.01f;
            cam.transform.position = cameraAt;
            cam.transform.LookAt(lookAt);
            var rt = new RenderTexture(size, size, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            rt.Create();
            cam.targetTexture = rt;
            cam.Render();
            cam.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, size, size), 0, 0);
            tex.Apply();
            RenderTexture.active = null;
            File.WriteAllBytes($"Builds/Renders/{file}.png", tex.EncodeToPNG());
            cam.targetTexture = null;
            Object.DestroyImmediate(rt);
            Object.DestroyImmediate(camGo);
            subject.gameObject.SetActive(was);
            foreach (var go in hidden) go.SetActive(true);
            ShaderUtil.allowAsyncCompilation = asyncShaders;
        }
    }
}
