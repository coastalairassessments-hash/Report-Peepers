import fs from "node:fs"; import cp from "node:child_process";
const doc = (text) => ({ page_count: 1, status: "readable", pages: [{ index: 1, label: null, width: 612, height: 792, rotation: 0, text, spans: [], quality_flags: [] }] });
const r = [];
try { fs.writeFileSync("/tmp/probe-should-not-exist.txt", "x"); r.push("write:allowed"); } catch (e) { r.push("write:" + e.code); }
try { cp.execSync("echo hi"); r.push("spawn:allowed"); } catch (e) { r.push("spawn:" + (e.code || "denied")); }
try { fs.readFileSync("/etc/hostname"); r.push("read:allowed"); } catch (e) { r.push("read:" + e.code); }
r.push("env:" + Object.keys(process.env).length);
process.stdin.resume(); process.stdin.on("end", () => console.log(JSON.stringify(doc(r.join(",")))));
