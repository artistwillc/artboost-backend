import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync(new URL("../website/workspace/index.html",import.meta.url),"utf8");
const js=fs.readFileSync(new URL("../website/workspace/workspace.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../website/workspace/workspace.css",import.meta.url),"utf8");

for (const view of ["home","products","stores","consultant","create","schedule","connections"]) {
  assert.match(html,new RegExp('data-view="'+view+'"'),"missing workspace navigation view: "+view);
}
for (const id of ["status","productCount","storeCount","accountState","workspacePanel","viewContent","refresh","signOut"]) {
  assert.match(html,new RegExp('id="'+id+'"'),"missing workspace element: "+id);
}
for (const route of ["/products?limit=60","/stores","/automations","/social-connect/providers","/ai/assistant","/generate","/pinterest/boards","/pinterest/create-pin","/schedule-campaign"]) {
  assert.ok(js.includes(route),"missing workspace API route: "+route);
}
for (const marker of ["COMMAND CENTER","Dashboard","data-dashboard-view","Open Products","Open Stores","Ask Consultant","Create Content","Open Schedule","Open Connections"]) {\n  assert.ok(js.includes(marker),"missing flagship dashboard marker: "+marker);\n}\nfor (const marker of ["Authorization:","refreshSession","artboost_web_session","safeHttpUrl","escapeHtml","publishGeneratedPinterest","scheduleGeneratedPinterest"]) {
  assert.ok(js.includes(marker),"missing workspace auth/safety/workflow marker: "+marker);
}
for (const marker of ["--gold:#ffb000","--purple:#8a43ff","radial-gradient","backdrop-filter","@media(max-width:900px)","@media(max-width:650px)"]) {
  assert.ok(css.includes(marker),"missing workspace visual/responsive marker: "+marker);
}

console.log("web workspace regression: PASS");
