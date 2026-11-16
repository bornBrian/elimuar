import { spawnSync } from "node:child_process";

const unity = process.env.UNITY ?? "C:/Program Files/Unity/Hub/Editor/6000.6.2f1/Editor/Unity.exe";
const result = spawnSync(unity, process.argv.slice(2), { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
