import fs from "node:fs"; import path from "node:path"; import http from "node:http";
const { chromium } = (await import("playwright-core")).default ?? (await import("playwright-core"));
function fc(){for(const b of [process.env.PLAYWRIGHT_BROWSERS_PATH,"/opt/pw-browsers"].filter(Boolean)){
 if(!fs.existsSync(b))continue;for(const d of fs.readdirSync(b)){if(!d.startsWith("chromium-"))continue;
 const e=path.join(b,d,"chrome-linux","chrome");if(fs.existsSync(e))return e;}}return null;}
const ROOT="/home/user/uzagi";
const MIME={".html":"text/html",".js":"text/javascript",".mjs":"text/javascript"};
const server=http.createServer((q,s)=>{
  if(q.url==="/favicon.ico"){s.writeHead(204);s.end();return;}
  const f=path.join(ROOT, decodeURIComponent(q.url.split("?")[0]));
  if(!f.startsWith(ROOT)){s.writeHead(403);s.end();return;}
  fs.readFile(f,(e,d)=>{if(e){s.writeHead(404);s.end("nf");return;}
    s.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream"});s.end(d);});});
await new Promise(r=>server.listen(5193,r));
const br=await chromium.launch({executablePath:fc(),args:["--use-gl=swiftshader","--enable-unsafe-swiftshader"]});
// ゲーム本編と同じ解像度落とし（0.72）とピクセレート表示を再現する
const p=await br.newPage({viewport:{width: Math.round(900/0.72), height: Math.round(560/0.72)}, deviceScaleFactor:1});
await p.goto("http://127.0.0.1:5193/tools/preview/index.html");
await p.waitForFunction(()=>window.__ready,null,{timeout:20000});
const OUT="/tmp/claude-0/-home-user-uzagi/5aa2bc9c-0c15-5810-a1ac-78851a641026/scratchpad";
// 実際のカメラ距離 9.5（camera.js の distance）
await p.evaluate(()=>window.__view(0, 9.5, 0.9));
await p.waitForTimeout(150);
await p.locator("canvas").screenshot({path:`${OUT}/dist-heroine.png`});
await p.evaluate(()=>window.__swap("rabbit"));
await p.evaluate(()=>window.__view(0, 9.5, 0.9));
await p.waitForTimeout(150);
await p.locator("canvas").screenshot({path:`${OUT}/dist-rabbit.png`});
console.log("done");
await br.close(); server.close();
