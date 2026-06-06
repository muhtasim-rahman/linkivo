// Linkivo — utils.js  v1.4.0
export function genId(prefix=''){return prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

// ══ POINT SYSTEM — Single source of truth ════════════════
export function calcLinkPoints(link){
  if(link.blocked)return 0;
  let pts=100;
  if(link.liked)    pts+=50;
  if(link.disliked) pts-=40;
  if(link.starred)  pts+=100;
  const opens=link.openCount||0;
  if(opens>10)pts*=Math.max(0.4,1-(opens-10)*0.02);
  return Math.max(0,Math.round(pts));
}

export function weightedRandom(items,weightFn){
  const w=items.map(weightFn),total=w.reduce((a,b)=>a+b,0);
  if(!total)return items[Math.floor(Math.random()*items.length)];
  let rand=Math.random()*total;
  for(let i=0;i<items.length;i++){rand-=w[i];if(rand<=0)return items[i];}
  return items[items.length-1];
}

// ══ ADVANCED URL DETECTION ════════════════════════════════
const KNOWN_TLDS=new Set(['com','net','org','io','co','app','dev','ai','gov','edu','mil','info','biz','me','tv','fm','ly','gg','xyz','site','web','online','store','shop','blog','news','tech','cloud','uk','us','ca','au','de','fr','jp','cn','in','br','ru','it','es','nl','se','no','dk','fi','pl','cz','hu','ro','bg','bd','pk','np','lk','sg','ph','id','tw','hk','kr','vn','th','my']);
const STRICT_URL_RE=/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/gi;
const WWW_RE=/\bwww\.([-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,})([-a-zA-Z0-9@:%_+.~#?&/=]*)/gi;

export function validateAndNormalizeUrl(raw){
  if(!raw||typeof raw!=='string')return null;
  let url=raw.trim().replace(/[)>\]"',;\.]+$/,'');
  if(/^https?:\/\//i.test(url)){try{new URL(url);return url;}catch{return null;}}
  if(/^www\./i.test(url)){try{new URL('https://'+url);return'https://'+url;}catch{return null;}}
  const parts=url.split('/')[0].split('.');
  if(parts.length>=2){
    const tld=parts[parts.length-1].toLowerCase();
    if(KNOWN_TLDS.has(tld)&&parts[0].length>=2&&!/^\d+$/.test(parts[0])){
      try{new URL('https://'+url);return'https://'+url;}catch{}
    }
  }
  return null;
}

export function extractUrls(text){
  if(!text)return[];
  const seen=new Set(),result=[];
  const add=(raw)=>{const n=validateAndNormalizeUrl(raw);if(n&&!seen.has(n)){seen.add(n);result.push(n);}};
  const s=text.match(STRICT_URL_RE)||[];s.forEach(add);
  let m;
  WWW_RE.lastIndex=0;
  while((m=WWW_RE.exec(text))!==null)add('www.'+m[1]+(m[2]||''));
  // Bare domain detection
  const bareRe=/\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+([a-zA-Z]{2,})\b(?:\/[-a-zA-Z0-9@:%_+.~#?&/=]*)*/g;
  bareRe.lastIndex=0;
  while((m=bareRe.exec(text))!==null){
    const c=m[0];
    if(/^[\w.-]+@/.test(c))continue;
    if(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|ttf|pdf|zip|mp4|mp3|exe|py|ts|json)$/i.test(c))continue;
    if(/^\d+\.\d+/.test(c))continue; // skip IP-like things like 1.0.0
    add(c);
  }
  return result;
}

export function isSameUrl(a,b){
  try{const n=u=>new URL(u).href.replace(/\/$/,'').toLowerCase();return n(a)===n(b);}catch{return a===b;}
}
export function isValidUrl(str){return validateAndNormalizeUrl(str)!==null;}
export function getDomain(url){try{return new URL(url).hostname.replace('www.','');}catch{return url.replace(/^https?:\/\/(www\.)?/,'').split('/')[0];}}
export function getFavicon(url){try{return`https://www.google.com/s2/favicons?domain=${new URL(url).origin}&sz=64`;}catch{return null;}}
export function cleanUrl(url){url=url.trim();if(url&&!url.startsWith('http'))url='https://'+url;return url;}

export function escapeHtml(str){if(typeof str!=='string')return str??'';return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}

export function timeAgo(ts){const d=Date.now()-(ts||Date.now()),s=Math.floor(d/1000);if(s<60)return'just now';if(s<3600)return`${Math.floor(s/60)}m ago`;if(s<86400)return`${Math.floor(s/3600)}h ago`;if(s<604800)return`${Math.floor(s/86400)}d ago`;return new Date(ts).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});}
export function formatDate(ts){return new Date(ts).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});}

export const Storage={
  get:(k,fb=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):fb;}catch{return fb;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  remove:(k)=>{try{localStorage.removeItem(k);}catch{}},
};

export const Theme={
  init(){this.apply(Storage.get('theme','light'));},
  apply(theme){document.documentElement.setAttribute('data-theme',theme);Storage.set('theme',theme);document.querySelectorAll('.logo-light').forEach(el=>el.classList.toggle('hidden',theme==='dark'));document.querySelectorAll('.logo-dark').forEach(el=>el.classList.toggle('hidden',theme!=='dark'));},
  toggle(){this.apply(this.current()==='dark'?'light':'dark');},
  current(){return Storage.get('theme','light');}
};

export function toast(message,type='info',duration=3200){
  const container=document.getElementById('toast-container');if(!container)return;
  const icons={success:'fa-circle-check',error:'fa-circle-xmark',warning:'fa-triangle-exclamation',info:'fa-circle-info'};
  const colors={success:'#10b981',error:'#ef4444',warning:'#f59e0b',info:'#3b82f6'};
  const el=document.createElement('div');
  el.className=`toast toast-${type}`;
  el.innerHTML=`<i class="fa-solid ${icons[type]||icons.info} toast-icon" style="color:${colors[type]||colors.info}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  const remove=()=>{el.classList.add('toast-out');setTimeout(()=>el.remove(),250);};
  setTimeout(remove,duration);el.addEventListener('click',remove);
}

export function showModal(html,onClose){
  const backdrop=document.createElement('div');backdrop.className='modal-backdrop';
  backdrop.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(backdrop);
  const modal=backdrop.querySelector('.modal');
  const close=()=>{backdrop.remove();onClose?.();};modal._close=close;
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  const esc=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',esc);}};
  document.addEventListener('keydown',esc);
  return{modal,close};
}
export function closeModal(modal){modal?._close?.();}

export function confirm(title,message,danger=false){
  return new Promise(resolve=>{
    const{modal,close}=showModal(`
      <div class="modal-header"><span class="modal-title">${escapeHtml(title)}</span><button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body"><p style="color:var(--text-muted);font-size:var(--fs-sm)">${escapeHtml(message)}</p></div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm confirm-cancel">Cancel</button><button class="btn ${danger?'btn-danger':'btn-primary'} btn-sm confirm-ok">${danger?'Delete':'Confirm'}</button></div>`);
    modal.querySelector('.confirm-ok').onclick=()=>{close();resolve(true);};
    modal.querySelector('.confirm-cancel').onclick=()=>{close();resolve(false);};
    modal.querySelector('.modal-close-btn').onclick=()=>{close();resolve(false);};
  });
}

export function prompt(title,placeholder='',defaultValue=''){
  return new Promise(resolve=>{
    const{modal,close}=showModal(`
      <div class="modal-header"><span class="modal-title">${escapeHtml(title)}</span><button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body"><input class="form-input prompt-input" type="text" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}"></div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm prompt-cancel">Cancel</button><button class="btn btn-primary btn-sm prompt-ok">OK</button></div>`);
    const input=modal.querySelector('.prompt-input');input.focus();input.select();
    const submit=()=>{close();resolve(input.value.trim());};
    modal.querySelector('.prompt-ok').onclick=submit;
    modal.querySelector('.prompt-cancel').onclick=()=>{close();resolve(null);};
    modal.querySelector('.modal-close-btn').onclick=()=>{close();resolve(null);};
    input.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
  });
}

export function pinDialog(title='Enter PIN',message=''){
  return new Promise(resolve=>{
    const{modal,close}=showModal(`
      <div class="modal-header"><span class="modal-title">${escapeHtml(title)}</span><button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button></div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;align-items:center">
        ${message?`<p style="color:var(--text-muted);font-size:var(--fs-sm);text-align:center">${escapeHtml(message)}</p>`:''}
        <div style="display:flex;gap:8px;justify-content:center">${[0,1,2,3,4,5].map(i=>`<div class="lock-pin-dot" data-i="${i}"></div>`).join('')}</div>
        <input class="form-input pin-input" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]*" autocomplete="off" style="text-align:center;letter-spacing:8px;font-size:22px;width:180px">
        <div class="pin-error" style="color:var(--danger);font-size:var(--fs-xs);min-height:16px;text-align:center"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary btn-sm pin-cancel">Cancel</button><button class="btn btn-primary btn-sm pin-ok">Confirm</button></div>`);
    const input=modal.querySelector('.pin-input');const dots=modal.querySelectorAll('.lock-pin-dot');input.focus();
    input.addEventListener('input',()=>{const val=input.value.replace(/\D/g,'').slice(0,6);input.value=val;dots.forEach((d,i)=>{d.classList.toggle('filled',i<val.length);d.classList.remove('error');});});
    const submit=()=>{const val=input.value.trim();if(val.length!==6){modal.querySelector('.pin-error').textContent='PIN must be 6 digits';input.focus();return;}close();resolve(val);};
    modal.querySelector('.pin-ok').onclick=submit;
    modal.querySelector('.pin-cancel').onclick=()=>{close();resolve(null);};
    modal.querySelector('.modal-close-btn').onclick=()=>{close();resolve(null);};
    input.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
  });
}

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
  let left=align==='right'?rect.right-mw:rect.left,top=rect.bottom+4;
  if(left+mw>window.innerWidth-8)left=window.innerWidth-mw-8;
  if(left<8)left=8;
  if(top+300>window.innerHeight)top=rect.top-4;
  menu.style.cssText=`position:fixed;top:${top}px;left:${left}px;min-width:${mw}px;z-index:9999`;
  const dismiss=e=>{if(!menu.contains(e.target)){menu.remove();document.removeEventListener('click',dismiss,true);}};
  setTimeout(()=>document.addEventListener('click',dismiss,true),10);
  return menu;
}

export function debounce(fn,delay=300){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),delay);};}
export function clone(obj){return JSON.parse(JSON.stringify(obj));}
export function truncate(str,len=60){return str?.length>len?str.slice(0,len)+'…':(str||'');}

export async function copyToClipboard(text){
  try{await navigator.clipboard.writeText(text);return true;}
  catch{const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();return true;}
}

export async function readClipboard(){try{return await navigator.clipboard.readText();}catch{return null;}}

export async function registerSW(){
  if('serviceWorker'in navigator){try{await navigator.serviceWorker.register('/sw.js');}catch(e){console.warn('[SW]',e);}}
}

export async function purgeExpiredRecycleBin(uid,db,ref,remove){
  try{
    const{get}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js');
    const snap=await get(ref(db,`users/${uid}/recycleBin`));if(!snap.exists())return;
    const now=Date.now(),items=snap.val();
    const expired=Object.entries(items).filter(([,v])=>v.expireAt&&v.expireAt<now);
    for(const[key]of expired)await remove(ref(db,`users/${uid}/recycleBin/${key}`));
    if(expired.length)console.log(`[RecycleBin] Purged ${expired.length} expired items`);
  }catch(e){console.warn('[RecycleBin purge]',e);}
}

export function initNetworkStatus(){
  const banner=document.createElement('div');banner.id='offline-banner';
  banner.style.cssText='position:fixed;top:0;left:0;right:0;background:#374151;color:#fff;text-align:center;font-size:13px;font-weight:600;padding:6px;z-index:99999;display:none;';
  banner.innerHTML='<i class="fa-solid fa-wifi-slash" style="margin-right:6px"></i>You are offline — changes will sync when reconnected';
  document.body.appendChild(banner);
  const update=()=>{banner.style.display=navigator.onLine?'none':'block';};
  window.addEventListener('online',update);window.addEventListener('offline',update);update();
}
