const doc = (text) => ({ page_count: 1, status: "readable", pages: [{ index: 1, label: null, width: 612, height: 792, rotation: 0, text, spans: [], quality_flags: [] }] });
process.stdin.resume(); process.stdin.on("end", () => console.log(JSON.stringify(doc("hello"))));
