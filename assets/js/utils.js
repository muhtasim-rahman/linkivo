// ============================================================
// Linkivo — utils.js  v1.4.3
// Single source of truth: calcLinkPoints, URL detection,
// toast, modal, confirm, PIN, dropdown, theme, storage
// ============================================================

export function genId(p=''){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

// ══ POINT SYSTEM — single source ════════════════════════
export function calcLinkPoints(link){
  if(link.blocked)return 0;
  let pts=100;
  if(link.liked)    pts+=50;
  if(link.disliked) pts-=40;
  if(link.starred)  pts+=100;
  const o=link.openCount||0;
  if(o>10)pts*=Math.max(0.4,1-(o-10)*0.02);
  return Math.max(0,Math.round(pts));
}

export function weightedRandom(items,wfn){
  const w=items.map(wfn),t=w.reduce((a,b)=>a+b,0);
  if(!t)return items[Math.floor(Math.random()*items.length)];
  let r=Math.random()*t;
  for(let i=0;i<items.length;i++){r-=w[i];if(r<=0)return items[i];}
  return items[items.length-1];
}

// ══ ADVANCED URL DETECTION ════════════════════════════════
const TLDS=new Set(['com','net','org','io','co','app','dev','ai','gov','edu','info','biz','me','tv','fm','ly','gg','xyz','site','web','online','store','shop','blog','news','tech','cloud','uk','us','ca','au','de','fr','jp','cn','in','br','ru','it','es','nl','se','no','dk','fi','pl','bd','pk','sg','ph','id','tw','hk','kr','vn','th','my','ae','sa','eg','ng','za','gh']);
const STRICT_RE=/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/gi;
const WWW_RE=/\bwww\.([-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,})([-a-zA-Z0-9@:%_+.~#?&/=]*)/gi;

export function validateAndNormalizeUrl(raw){
  if(!raw||typeof raw!=='string')return null;
  let u=raw.trim().replace(/[)>\]"',;]+$/,'');
  if(!u)return null;
  if(/^https?:\/\//i.test(u)){try{new URL(u);return u;}catch{return null;}}
  if(/^www\./i.test(u)){try{new URL('https://'+u);return'https://'+u;}catch{return null;}}
  const parts=u.split('/')[0].split('.');
  if(parts.length>=2){
    const tld=parts[parts.length-1].toLowerCase();
    if(TLDS.has(tld)&&parts[0].length>=2&&!/^\d+$/.test(parts.join('.'))){
      try{new URL('https://'+u);return'https://'+u;}catch{}
    }
  }
  return null;
}

export function extractUrls(text){
  if(!text)return[];
  const seen=new Set(),res=[];
  const add=raw=>{const n=validateAndNormalizeUrl(raw);if(n&&!seen.has(n)){seen.add(n);res.push(n);}};
  (text.match(STRICT_RE)||[]).forEach(add);
  let m;
  WWW_RE.lastIndex=0;
  while((m=WWW_RE.exec(text))!==null)add('www.'+m[1]+(m[2]||''));
  // Bare domains
  const bareRe=/\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+([a-zA-Z]{2,})\b(?:\/[-a-zA-Z0-9@:%_+.~#?&/=]*)*/g;
  while((m=bareRe.exec(text))!==null){
    const c=m[0];
    if(/^[\w.-]+@/.test(c))continue;                          // email
    if(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|ttf|pdf|zip|mp4|mp3|exe|py|ts|json|yaml|xml|md|txt)$/i.test(c))continue;
    if(/^\d+\.\d+/.test(c))continue;                          // version numbers
    if(!/\.[a-zA-Z]{2,}$/.test(c.split('/')[0]))continue;    // needs a TLD
    add(c);
  }
  return res;
}

export function isValidUrl(s){return!!validateAndNormalizeUrl(s);}
export function getDomain(url){try{return new URL(url).hostname.replace('www.','');}catch{return url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0];}}
export function getFavicon(url){try{return`https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=64`;}catch{return null;}}
export function cleanUrl(url){url=url.trim();if(url&&!/^https?:\/\//i.test(url))url='https://'+url;return url;}
export function isSameUrl(a,b){try{const n=u=>new URL(u).href.replace(/\/$/,'').toLowerCase();return n(a)===n(b);}catch{return a===b;}}

// ══ HTML ════════════════════════════════════════════════
export function escapeHtml(s){if(typeof s!=='string')return s??'';return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

// ══ DATE ════════════════════════════════════════════════
export function timeAgo(ts){const d=Date.now()-(ts||Date.now()),s=Math.floor(d/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;if(s<604800)return`${Math.floor(s/86400)}d ago`;return new Date(ts).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});}
export function formatDate(ts){return new Date(ts).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});}

// ══ STORAGE ═════════════════════════════════════════════
export const Storage={
  get:(k,fb=null)=>{try{const v=localStorage.getItem(k);return v!==null?JSON.parse(v):fb;}catch{return fb;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  remove:(k)=>{try{localStorage.removeItem(k);}catch{}},
};

// ══ THEME ════════════════════════════════════════════════
export const Theme={
  init(){this.apply(Storage.get('theme','light'));},
  apply(t){document.documentElement.setAttribute('data-theme',t);Storage.set('theme',t);document.querySelectorAll('.logo-light').forEach(e=>e.classList.toggle('hidden',t==='dark'));document.querySelectorAll('.logo-dark').forEach(e=>e.classList.toggle('hidden',t!=='dark'));},
  toggle(){this.apply(this.current()==='dark'?'light':'dark');},
  current(){return Storage.get('theme','light');}
};

// ══ TOAST ════════════════════════════════════════════════
export function toast(message,type='info',duration=3200){
  const c=document.getElementById('toast-container');if(!c)return;
  const icons={success:'fa-circle-check',error:'fa-circle-xmark',warning:'fa-triangle-exclamation',info:'fa-circle-info'};
  const colors={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  const el=document.createElement('div');
  el.className=`toast toast-${type}`;
  el.innerHTML=`<i class="fa-solid ${icons[type]||icons.info} toast-icon" style="color:${colors[type]||colors.info}"></i><span>${escapeHtml(message)}</span>`;
  c.appendChild(el);
  const rm=()=>{el.classList.add('toast-out');setTimeout(()=>el.remove(),220);};
  setTimeout(rm,duration);el.addEventListener('click',rm);
}

// ══ MODALS ═══════════════════════════════════════════════
export function showModal(html,onClose){
  const bd=document.createElement('div');bd.className='modal-backdrop';
  bd.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(bd);
  const modal=bd.querySelector('.modal');
  const close=()=>{bd.remove();onClose?.();};modal._close=close;
  bd.addEventListener('click',e=>{if(e.target===bd)close();});
  const esc=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',esc);}};
  document.addEventListener('keydown',esc);
  return{modal,close};
}
export function closeModal(m){m?._close?.();}

export function confirm(title,msg,danger=false){
  return new Promise(res=>{
    const{modal,close}=showModal(`
      <div class="modal-header"><span class="modal-title">${escapeHtml(title)}</span><button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body"><p style="color:var(--text-muted);font-size:var(--fs-sm)">${escapeHtml(msg)}</p></div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm cc">Cancel</button><button class="btn ${danger?'btn-danger':'btn-primary'} btn-sm co">${danger?'Delete':'Confirm'}</button></div>`);
    modal.querySelector('.co').onclick=()=>{close();res(true);};
    modal.querySelector('.cc').onclick=()=>{close();res(false);};
    modal.querySelector('.modal-close-btn').onclick=()=>{close();res(false);};
  });
}

export function prompt(title,placeholder='',def=''){
  return new Promise(res=>{
    const{modal,close}=showModal(`
      <div class="modal-header"><span class="modal-title">${escapeHtml(title)}</span><button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body"><input class="form-input pi" type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(def)}"></div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm pc">Cancel</button><button class="btn btn-primary btn-sm po">OK</button></div>`);
    const inp=modal.querySelector('.pi');inp.focus();inp.select();
    const sub=()=>{close();res(inp.value.trim());};
    modal.querySelector('.po').onclick=sub;
    modal.querySelector('.pc').onclick=()=>{close();res(null);};
    modal.querySelector('.modal-close-btn').onclick=()=>{close();res(null);};
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')sub();});
  });
}

export function pinDialog(title='Enter PIN',message=''){
  return new Promise(res=>{
    const{modal,close}=showModal(`
      <div class="modal-header"><span class="modal-title">${escapeHtml(title)}</span><button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;align-items:center">
        ${message?`<p style="color:var(--text-muted);font-size:var(--fs-sm);text-align:center">${escapeHtml(message)}</p>`:''}
        <div style="display:flex;gap:8px">${[0,1,2,3,4,5].map(i=>`<div class="lock-pin-dot" data-i="${i}"></div>`).join('')}</div>
        <input class="form-input pin-inp" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]*" autocomplete="off" style="text-align:center;letter-spacing:8px;font-size:22px;width:180px">
        <div class="pin-err" style="color:var(--danger);font-size:var(--fs-xs);min-height:16px;text-align:center"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm pin-c">Cancel</button><button class="btn btn-primary btn-sm pin-o">Confirm</button></div>`);
    const inp=modal.querySelector('.pin-inp');const dots=modal.querySelectorAll('.lock-pin-dot');inp.focus();
    inp.addEventListener('input',()=>{const v=inp.value.replace(/\D/g,'').slice(0,6);inp.value=v;dots.forEach((d,i)=>{d.classList.toggle('filled',i<v.length);d.classList.remove('error');});});
    const sub=()=>{const v=inp.value.trim();if(v.length!==6){modal.querySelector('.pin-err').textContent='PIN must be 6 digits';inp.focus();return;}close();res(v);};
    modal.querySelector('.pin-o').onclick=sub;
    modal.querySelector('.pin-c').onclick=()=>{close();res(null);};
    modal.querySelector('.modal-close-btn').onclick=()=>{close();res(null);};
    inp.addEventListener('keydown',e=>{if(e.key==='Enter')sub();});
  });
}

// ══ DROPDOWN ═════════════════════════════════════════════
export function showDropdown(anchor,items,{align='left'}={}){
  document.querySelectorAll('.dropdown').forEach(d=>d.remove());
  const menu=document.createElement('div');menu.className='dropdown';
  items.forEach(item=>{
    if(item==='divider'){const d=document.createElement('div');d.className='dropdown-divider';menu.appendChild(d);return;}
    const btn=document.createElement('button');
    btn.className=`dropdown-item${item.danger?' danger':''}`;
    btn.innerHTML=`<i class="${item.icon||''}"></i>${escapeHtml(item.label)}`;
    if(item.disabled){btn.disabled=true;btn.style.opacity='0.5';}
    btn.onclick=()=>{menu.remove();item.action?.();};
    menu.appendChild(btn);
  });
  document.body.appendChild(menu);
  const rect=anchor.getBoundingClientRect(),mw=200;
  let l=align==='right'?rect.right-mw:rect.left,t=rect.bottom+4;
  if(l+mw>window.innerWidth-8)l=window.innerWidth-mw-8;
  if(l<8)l=8;
  if(t+280>window.innerHeight)t=rect.top-4;
  menu.style.cssText=`position:fixed;top:${t}px;left:${l}px;min-width:${mw}px;z-index:99999`;
  const dm=e=>{if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',dm,true);}};
  setTimeout(()=>document.addEventListener('click',dm,true),10);
  return menu;
}

// ══ MISC ═════════════════════════════════════════════════
export function debounce(fn,d=300){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d);};}
export function truncate(s,n=60){return s?.length>n?s.slice(0,n)+'…':(s||'');}

export async function copyToClipboard(text){
  try{await navigator.clipboard.writeText(text);return true;}
  catch{const t=document.createElement('textarea');t.value=text;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();return true;}
}
export async function readClipboard(){try{return await navigator.clipboard.readText();}catch{return null;}}

export async function registerSW(){
  if(!('serviceWorker'in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register('/sw.js');
    // Auto-update: when new SW is waiting, activate it
    reg.addEventListener('updatefound',()=>{
      const newSW=reg.installing;
      newSW?.addEventListener('statechange',()=>{
        if(newSW.state==='installed'&&navigator.serviceWorker.controller){
          // New version available — skip waiting
          newSW.postMessage({type:'SKIP_WAITING'});
        }
      });
    });
    // When new SW takes control, reload for fresh content
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(document._swReloading)return;
      document._swReloading=true;
      window.location.reload();
    });
  }catch(e){console.warn('[SW]',e);}
}

export function initNetworkStatus(){
  let banner=document.getElementById('offline-banner');
  if(!banner){
    banner=document.createElement('div');banner.id='offline-banner';
    banner.innerHTML='<i class="fa-solid fa-wifi-slash"></i><span>You\'re offline — changes will sync when reconnected</span>';
    document.body.prepend(banner);
  }
  const update=()=>{
    banner.classList.toggle('show',!navigator.onLine);
    // Also shift page down if offline banner visible
    document.getElementById('app-container')?.style.setProperty('padding-top',navigator.onLine?'0':'36px');
    document.getElementById('auth-container')?.style.setProperty('padding-top',navigator.onLine?'0':'36px');
  };
  window.addEventListener('online',update);
  window.addEventListener('offline',update);
  update();
}

export async function purgeExpiredRecycleBin(uid){
  try{
    const{db,ref,get:dbGet,remove:dbRemove}=await import('./firebase-init.js');
    const snap=await dbGet(ref(db,`users/${uid}/recycleBin`));
    if(!snap.exists())return;
    const now=Date.now();
    const expired=Object.entries(snap.val()).filter(([,v])=>v.expireAt&&v.expireAt<now);
    for(const[key]of expired)await dbRemove(ref(db,`users/${uid}/recycleBin/${key}`));
    if(expired.length)console.log(`[Bin] Purged ${expired.length} expired`);
  }catch{}
}
