const t = await (await fetch("https://www.modulargunworks.com/")).text();
const re = /href="([^"]*(?:return|refund|ship|policy)[^"]*)"/gi;
const s = new Set();
let m;
while ((m = re.exec(t))) s.add(m[1]);
[...s].forEach((x) => console.log(x));
