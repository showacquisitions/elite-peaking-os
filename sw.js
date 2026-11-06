// © 2026 Show Acquisitions. All rights reserved. Proprietary; see LICENSE.
// Offline shell: serve cached files instantly, refresh them in the background. Cross-origin (Supabase) calls pass through.
const C="elite-os-v3.4";
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(["./","index.html","manifest.webmanifest","icon.svg","apple-touch-icon.png","icon-192.png","icon-512.png"])).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin)return;
  if(u.pathname.endsWith("/version.json"))return; // always network: the app compares it with its own version to offer updates
  e.respondWith(caches.open(C).then(async c=>{
    const hit=await c.match(e.request,{ignoreSearch:true});
    const net=fetch(e.request).then(r=>{if(r.ok)c.put(e.request,r.clone());return r}).catch(()=>hit);
    return hit||net;
  }));
});

// Push notifications (v3.1). Payload: {title, body, url, tag, cat}. Every push shows a notification (required by iOS).
self.addEventListener("push",e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(x){d={title:"Elite OS",body:e.data?e.data.text():""}}
  e.waitUntil(self.registration.showNotification(d.title||"Elite OS",{body:d.body||"",tag:d.tag||undefined,renotify:!!d.tag,icon:"icon-192.png",badge:"icon-192.png",data:{url:d.url||""},requireInteraction:d.cat==="rest"}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const hash=(e.notification.data&&e.notification.data.url)||"";
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{
    for(const w of ws){if("focus" in w){w.postMessage({nav:hash});return w.focus()}}
    return self.clients.openWindow(self.registration.scope+(hash.startsWith("#")?hash:""));
  }));
});
