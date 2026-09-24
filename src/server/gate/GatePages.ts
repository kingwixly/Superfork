// Standalone HTML for the access gate and its admin panel.
//
// These pages are served to visitors who can't load anything else from the
// site yet, so they are fully self-contained: inline CSS and JS, no fonts,
// images or scripts from the (gated) asset paths. Colours follow the game's
// palette in src/client/styles.css (deep navy surface, hex cyan, malibu blue).

const BASE_CSS = `
:root{
  --bg:#0a1628;--bg2:#0f2140;--panel:rgba(12,28,54,.92);--line:rgba(0,200,255,.22);
  --text:#e8f1ff;--muted:#8fa6c4;--cyan:#00c8ff;--blue:#0084d1;--blue2:#3fa9f5;
  --ok:#22c55e;--warn:#ffd700;--bad:#f43f5e;--orange:#f97316;
  color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{
  font-family:"Overpass",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:var(--text);
  background:
    radial-gradient(1200px 600px at 50% -10%,rgba(0,132,209,.35),transparent 60%),
    linear-gradient(rgba(0,200,255,.05) 1px,transparent 1px) 0 0/32px 32px,
    linear-gradient(90deg,rgba(0,200,255,.05) 1px,transparent 1px) 0 0/32px 32px,
    var(--bg);
  min-height:100vh;display:flex;align-items:center;justify-content:center;
  padding:24px 16px;
}
.card{
  width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);
  border-radius:14px;padding:28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04);
  backdrop-filter:blur(6px);
}
.brand{font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:26px;margin:0 0 4px;text-align:center}
.brand span{color:var(--cyan)}
.sub{color:var(--muted);text-align:center;margin:0 0 22px;font-size:14px;line-height:1.5}
label{display:block;font-size:12px;color:var(--muted);margin:0 0 6px;letter-spacing:.04em;text-transform:uppercase}
input{
  width:100%;padding:11px 12px;border-radius:8px;border:1px solid var(--line);background:rgba(6,16,32,.8);
  color:var(--text);font:inherit;font-size:15px;outline:none;
}
input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px rgba(0,200,255,.18)}
button{
  font:inherit;font-weight:700;cursor:pointer;border:0;border-radius:8px;padding:11px 16px;
  background:var(--blue);color:#fff;transition:background .15s,transform .05s;
}
button:hover{background:var(--blue2)}
button:active{transform:translateY(1px)}
button:disabled{opacity:.55;cursor:default}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--text)}
button.ghost:hover{border-color:var(--cyan)}
.wide{width:100%;margin-top:12px}
.row{display:flex;gap:8px}
.row input{flex:1}
.divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;margin:26px 0 14px;text-transform:uppercase;letter-spacing:.08em}
.divider:before,.divider:after{content:"";flex:1;height:1px;background:var(--line)}
.msg{min-height:20px;font-size:13px;margin-top:10px;color:var(--muted)}
.msg.err{color:var(--bad)}
.status{text-align:center;padding:10px 0 4px}
.status h2{margin:10px 0 6px;font-size:18px}
.status p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}
.pulse{width:14px;height:14px;border-radius:50%;background:var(--warn);margin:0 auto;box-shadow:0 0 0 0 rgba(255,215,0,.6);animation:p 1.6s infinite}
@keyframes p{70%{box-shadow:0 0 0 14px rgba(255,215,0,0)}100%{box-shadow:0 0 0 0 rgba(255,215,0,0)}}
.hidden{display:none!important}
.code{letter-spacing:.4em;text-align:center;font-variant-numeric:tabular-nums}
.foot{margin-top:18px;text-align:center;font-size:11px;color:var(--muted);opacity:.7}
`;

function page(
  title: string,
  nonce: string,
  body: string,
  script: string,
  extraCss = "",
): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>${title}</title>
<link rel="icon" href="data:,">
<style nonce="${nonce}">${BASE_CSS}${extraCss}</style>
</head><body>
${body}
<script nonce="${nonce}">${script}</script>
</body></html>`;
}

export function gatePageHtml(nonce: string): string {
  const body = `
<main class="card" id="gate">
  <h1 class="brand">Super<span>Front</span></h1>
  <p class="sub">This server is private. Each device needs to be approved before it can play.</p>

  <noscript><p class="msg err">JavaScript is needed to request access.</p></noscript>

  <section id="s-none" class="hidden">
    <label for="note">Your name or a note (optional)</label>
    <input id="note" maxlength="80" autocomplete="nickname" placeholder="e.g. Sam from Discord">
    <button id="req" class="wide">Request access</button>
  </section>

  <section id="s-pending" class="status hidden">
    <div class="pulse"></div>
    <h2>Request pending</h2>
    <p>Keep this page open. It will open the game as soon as an admin approves this device.</p>
  </section>

  <section id="s-denied" class="status hidden">
    <h2>Access denied</h2>
    <p>This device's request was declined.</p>
  </section>

  <section id="s-ok" class="status hidden">
    <h2>Approved</h2>
    <p>Loading the game…</p>
  </section>

  <p id="msg" class="msg" role="status" aria-live="polite"></p>

  <div class="divider">Admin</div>
  <form id="admin" autocomplete="off">
    <label for="code">6-digit admin code</label>
    <div class="row">
      <input id="code" class="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" aria-label="Admin code">
      <button id="login" type="submit" class="ghost">Enter</button>
    </div>
    <p id="amsg" class="msg" role="status" aria-live="polite"></p>
  </form>
  <p class="foot">Access is tied to a cookie on this device. Clearing cookies means requesting again.</p>
</main>`;

  const script = `
(function(){
  var H={"Content-Type":"application/json","X-Requested-With":"superfront-gate"};
  var $=function(id){return document.getElementById(id)};
  var timer=null, current=null;
  function show(s){
    ["none","pending","denied","ok"].forEach(function(k){$("s-"+k).classList.toggle("hidden",k!==s)});
  }
  function msg(el,t,err){el.textContent=t||"";el.classList.toggle("err",!!err)}
  function enter(){
    show("ok");
    if(location.pathname.indexOf("/__gate")===0){location.replace("/")}else{location.reload()}
  }
  function apply(st){
    current=st.status;
    if(st.status==="approved"||st.admin){return enter()}
    show(st.status==="pending"?"pending":st.status==="denied"?"denied":"none");
    if(st.status==="pending"){poll()}
  }
  function check(){
    return fetch("/__gate/status",{credentials:"same-origin",cache:"no-store"})
      .then(function(r){if(!r.ok)throw new Error("status "+r.status);return r.json()})
      .then(apply)
      .catch(function(){msg($("msg"),"Could not reach the server. Retrying…",true);poll()});
  }
  function poll(){clearTimeout(timer);timer=setTimeout(check,5000)}
  $("req").addEventListener("click",function(){
    var b=$("req");b.disabled=true;msg($("msg"),"");
    fetch("/__gate/request",{method:"POST",credentials:"same-origin",headers:H,body:JSON.stringify({note:$("note").value})})
      .then(function(r){return r.json().then(function(j){return {r:r,j:j}})})
      .then(function(x){
        if(!x.r.ok){msg($("msg"),x.j.error||"Request failed",true);return}
        msg($("msg"),"");apply(x.j);
      })
      .catch(function(){msg($("msg"),"Request failed. Try again.",true)})
      .finally(function(){b.disabled=false});
  });
  $("code").addEventListener("input",function(e){e.target.value=e.target.value.replace(/\\D/g,"").slice(0,6)});
  $("admin").addEventListener("submit",function(e){
    e.preventDefault();
    var code=$("code").value, b=$("login");
    if(!/^\\d{6}$/.test(code)){msg($("amsg"),"Enter all 6 digits.",true);return}
    b.disabled=true;msg($("amsg"),"Checking…");
    fetch("/__gate/admin/login",{method:"POST",credentials:"same-origin",headers:H,body:JSON.stringify({code:code})})
      .then(function(r){return r.json().then(function(j){return {r:r,j:j}})})
      .then(function(x){
        if(x.r.ok){location.href="/__gate/admin";return}
        $("code").value="";msg($("amsg"),x.j.error||"Wrong code.",true);
      })
      .catch(function(){msg($("amsg"),"Login failed. Try again.",true)})
      .finally(function(){b.disabled=false});
  });
  check();
})();`;
  return page("SuperFront · Access", nonce, body, script);
}

const ADMIN_CSS = `
body{align-items:flex-start}
.card{max-width:880px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.top .brand{text-align:left;margin:0;font-size:22px}
.top .actions{display:flex;gap:8px}
.top a{text-decoration:none}
.tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.tabs button{background:transparent;border:1px solid var(--line);color:var(--muted);padding:7px 12px;font-size:13px}
.tabs button.on{background:rgba(0,200,255,.12);border-color:var(--cyan);color:var(--text)}
.count{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:9px;background:rgba(255,255,255,.08);font-size:11px;line-height:18px}
.list{display:flex;flex-direction:column;gap:8px}
.item{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:rgba(6,16,32,.55)}
.item .who{min-width:0;flex:1 1 260px}
.item .name{font-weight:700;overflow-wrap:anywhere}
.item .meta{font-size:12px;color:var(--muted);margin-top:3px;overflow-wrap:anywhere}
.item .btns{display:flex;gap:6px}
.item button{padding:7px 12px;font-size:13px}
.approve{background:#15803d}.approve:hover{background:var(--ok)}
.deny{background:#9f1239}.deny:hover{background:var(--bad)}
.empty{color:var(--muted);font-size:14px;padding:18px 4px}
.badge{font-size:11px;padding:2px 7px;border-radius:9px;margin-left:6px;vertical-align:middle;border:1px solid var(--line);color:var(--muted);font-weight:600}
`;

export function adminPageHtml(nonce: string): string {
  const body = `
<main class="card">
  <div class="top">
    <h1 class="brand">Super<span>Front</span> admin</h1>
    <div class="actions">
      <a href="/"><button class="ghost" type="button">Open game</button></a>
      <button id="logout" class="ghost" type="button">Log out</button>
    </div>
  </div>
  <div class="tabs" role="tablist">
    <button data-tab="pending" class="on">Pending<span class="count" id="c-pending">0</span></button>
    <button data-tab="approved">Approved<span class="count" id="c-approved">0</span></button>
    <button data-tab="denied">Denied<span class="count" id="c-denied">0</span></button>
  </div>
  <div id="list" class="list"></div>
  <p id="msg" class="msg" role="status" aria-live="polite"></p>
</main>`;

  const script = `
(function(){
  var H={"Content-Type":"application/json","X-Requested-With":"superfront-gate"};
  var $=function(id){return document.getElementById(id)};
  var tab="pending", data=[];
  function ago(t){
    var s=Math.max(0,Math.round((Date.now()-t)/1000));
    if(s<60)return s+"s ago"; if(s<3600)return Math.round(s/60)+"m ago";
    if(s<86400)return Math.round(s/3600)+"h ago"; return Math.round(s/86400)+"d ago";
  }
  function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
  function btn(label,cls,id,action){
    var b=el("button",cls,label);b.type="button";
    b.addEventListener("click",function(){act(id,action,b)});return b;
  }
  function render(){
    ["pending","approved","denied"].forEach(function(s){
      $("c-"+s).textContent=data.filter(function(d){return d.status===s}).length;
    });
    var list=$("list");list.textContent="";
    var rows=data.filter(function(d){return d.status===tab});
    if(!rows.length){list.appendChild(el("div","empty","Nothing here."));return}
    rows.forEach(function(d){
      var it=el("div","item"), who=el("div","who");
      var name=el("div","name",d.note||"(no name given)");
      if(d.revokedAt){name.appendChild(el("span","badge","revoked"))}
      who.appendChild(name);
      who.appendChild(el("div","meta","Requested "+ago(d.requestedAt)+(d.decidedAt?" · decided "+ago(d.decidedAt):"")+" · id "+d.id.slice(0,10)));
      who.appendChild(el("div","meta",d.userAgent||"unknown browser"));
      var b=el("div","btns");
      if(d.status==="pending"){b.appendChild(btn("Approve","approve",d.id,"approve"));b.appendChild(btn("Deny","deny",d.id,"deny"))}
      if(d.status==="approved"){b.appendChild(btn("Revoke","deny",d.id,"revoke"))}
      if(d.status==="denied"){b.appendChild(btn("Approve","approve",d.id,"approve"));b.appendChild(btn("Delete","ghost",d.id,"delete"))}
      it.appendChild(who);it.appendChild(b);list.appendChild(it);
    });
  }
  function load(){
    return fetch("/__gate/admin/requests",{credentials:"same-origin",cache:"no-store"})
      .then(function(r){if(r.status===401){location.href="/__gate/";throw new Error("logged out")}return r.json()})
      .then(function(j){data=j.requests||[];render();$("msg").textContent=""})
      .catch(function(e){if(e.message!=="logged out"){$("msg").textContent="Could not load requests."}});
  }
  function act(id,action,b){
    if(action==="revoke"&&!confirm("Revoke access for this device?"))return;
    if(action==="delete"&&!confirm("Delete this record? The device could request again."))return;
    b.disabled=true;
    fetch("/__gate/admin/requests/"+encodeURIComponent(id)+"/"+action,{method:"POST",credentials:"same-origin",headers:H,body:"{}"})
      .then(function(r){if(!r.ok)throw new Error();return load()})
      .catch(function(){$("msg").textContent="Action failed.";b.disabled=false});
  }
  document.querySelectorAll(".tabs button").forEach(function(b){
    b.addEventListener("click",function(){
      tab=b.getAttribute("data-tab");
      document.querySelectorAll(".tabs button").forEach(function(x){x.classList.toggle("on",x===b)});
      render();
    });
  });
  $("logout").addEventListener("click",function(){
    fetch("/__gate/admin/logout",{method:"POST",credentials:"same-origin",headers:H,body:"{}"})
      .finally(function(){location.href="/__gate/"});
  });
  load();setInterval(load,10000);
})();`;
  return page("SuperFront · Admin", nonce, body, script, ADMIN_CSS);
}
