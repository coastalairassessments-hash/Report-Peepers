const chunk = "x".repeat(65536);
for (let i = 0; i < 400; i++) process.stdout.write(chunk);
setInterval(() => {}, 1000);
