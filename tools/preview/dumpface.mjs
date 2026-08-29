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
const p=await br.newPage({viewport:{width:1024,height:1024}});
await p.goto("http://127.0.0.1:5193/tools/preview/dumpface.html");
await p.waitForFunction(()=>window.__ready,null,{timeout:20000});
const OUT="/tmp/claude-0/-home-user-uzagi/5aa2bc9c-0c15-5810-a1ac-78851a641026/scratchpad";
await p.locator("canvas").screenshot({path:`${OUT}/face_tex_flat.png`});
console.log("done");
await br.close(); server.close();
