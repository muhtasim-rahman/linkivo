// ============================================================
// Linkivo — app.js  v1.4.2
// Main entry: auth, sidebar collapse, More menu, profile sheet,
// header tab title, theme, app lock, all critical bug fixes
// ============================================================

import Config from './config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth, db, ref, get, update, onValue } from './firebase-init.js';
import { initAuthUI, logout, getCurrentUser, resetPassword } from './auth.js';
import Router from './router.js';
import { Theme, Storage, toast, registerSW, showDropdown, escapeHtml, initNetworkStatus, purgeExpiredRecycleBin, readClipboard, validateAndNormalizeUrl } from './utils.js';

// ── Export for settings.js ────────────────────────────────
export function applyAccent(a){
  document.documentElement.setAttribute('data-accent',a||'blue');
  Storage.set('accent',a||'blue');
  // Update CSS gradient var used in SVG logo
  const c1s={ blue:'#3b82f6', purple:'#8b5cf6', green:'#10b981', orange:'#f59e0b', rose:'#f43f5e' };
  const c2s={ blue:'#22d3ee', purple:'#a78bfa', green:'#34d399', orange:'#fbbf24', rose:'#fb7185' };
  document.documentElement.style.setProperty('--lv-c1', c1s[a]||c1s.blue);
  document.documentElement.style.setProperty('--lv-c2', c2s[a]||c2s.blue);
}
export function applyFontSize(s){
  document.documentElement.setAttribute('data-fontsize',s||'medium');
  Storage.set('fontSize',s||'medium');
}

// ── Boot ─────────────────────────────────────────────────
async function boot(){
  await Config.load();
  Theme.init();
  applyAccent(Storage.get('accent','blue'));
  applyFontSize(Storage.get('fontSize','medium'));
  await registerSW();
  initNetworkStatus();
  initAuthUI();

  onAuthStateChanged(auth,user=>{
    if(user) showApp(user);
    else     showAuth();
  });

  // Config values
  const cfg=Config.get();
  document.querySelectorAll('[data-app-version]').forEach(el=>el.textContent=cfg.version);
  document.querySelectorAll('[data-app-name]').forEach(el=>el.textContent=cfg.name);
}

function showAuth(){
  document.getElementById('auth-container')?.classList.remove('hidden');
  document.getElementById('app-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
}

async function showApp(user){
  document.getElementById('auth-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
  document.getElementById('app-container')?.classList.remove('hidden');

  // Populate user info
  const name=(user.displayName||'User'), email=(user.email||''), photo=(user.photoURL||'');
  const init=(name[0]||'U').toUpperCase();
  document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=name);
  document.querySelectorAll('[data-user-email]').forEach(el=>el.textContent=email);
  document.querySelectorAll('.user-avatar').forEach(el=>{
    el.innerHTML=photo?`<img src="${photo}" alt="${init}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:init;
  });

  // Expose Firebase globally
  window.__firebase={db,ref,onValue,get,update};

  // Init
  initRouter(user);
  bindGlobalActions(user);
  initSidebar();
  initAppLock();

  // Background tasks
  setTimeout(()=>document.dispatchEvent(new CustomEvent('linkivo:userReady',{detail:{uid:user.uid,user}})),200);

  // Load user DB settings
  loadUserSettings(user.uid);

  // Purge expired recycle bin
  purgeExpiredRecycleBin(user.uid);

  // Clipboard URL suggestion
  setTimeout(()=>_clipboardSuggestion(),2500);
}

async function loadUserSettings(uid){
  try{
    const snap=await get(ref(db,`users/${uid}/settings`));
    if(!snap.exists())return;
    const s=snap.val();
    if(s.theme)    { Theme.apply(s.theme); }
    if(s.accent)   { applyAccent(s.accent); }
    if(s.fontSize) { applyFontSize(s.fontSize); }
    if(s.showLinkUrls!==undefined) Storage.set('showLinkUrls',s.showLinkUrls);
    if(s.openLinksNewTab!==undefined) Storage.set('openLinksNewTab',s.openLinksNewTab);
    if(s.historyMax) Storage.set('historyMax',s.historyMax);
  }catch{}
}

// ── Router ────────────────────────────────────────────────
function initRouter(user){
  Router.register('home',    {onEnter:()=>window.HomeModule?.init?.()});
  Router.register('random',  {onEnter:()=>window.RandomModule?.init?.()});
  Router.register('history', {onEnter:()=>window.HistoryModule?.init?.()});
  Router.register('settings',{onEnter:()=>window.SettingsModule?.init?.()});
  Router.register('folder',  {onEnter:p=>{
    if(p?.folder) window.FolderModule?.open?.(p);
    else if(p?.folderId) _openFolderById(p.folderId);
  }});
  window.Router=Router;
  Router.init('home');
}

async function _openFolderById(fid){
  const user=getCurrentUser();if(!user)return;
  const snap=await get(ref(db,`users/${user.uid}/folders/${fid}`));
  if(snap.exists()) window.FolderModule?.open?.({folder:snap.val()});
  else Router.go('home');
}

// ── Global actions ────────────────────────────────────────
function bindGlobalActions(user){
  // Theme toggle
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn=>{
    btn.addEventListener('click',()=>{ Theme.toggle(); _syncThemeIcon(); });
  });
  _syncThemeIcon();

  // Logout
  document.querySelectorAll('[data-action="logout"]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const{confirm}=await import('./utils.js');
      if(await confirm('Sign Out','Are you sure you want to sign out?',false)) logout();
    });
  });

  // Avatar / profile
  document.getElementById('topbar-avatar')?.addEventListener('click',e=>{ e.stopPropagation(); showProfileSheet(user); });
  document.getElementById('sidebar-profile')?.addEventListener('click',()=>showProfileSheet(user));

  // Import (FAB + sidebar) — FIX: no more placeholder toast
  const importHandler=()=>_triggerImport();
  document.getElementById('fab-import-btn')?.addEventListener('click',importHandler);
  document.getElementById('sidebar-import-btn')?.addEventListener('click',importHandler);

  // More menu (mobile)
  document.getElementById('nav-more-btn')?.addEventListener('click',()=>showMoreMenu(user));

  // Recycle bin
  const rbHandler=async()=>{ const{showRecycleBin}=await import('./links.js'); showRecycleBin(); };
  document.getElementById('recycle-bin-btn')?.addEventListener('click',rbHandler);
  document.getElementById('sidebar-recycle-btn')?.addEventListener('click',rbHandler);
}

// ── Import trigger (FAB fixed) ─────────────────────────────
async function _triggerImport(){
  const{getFolders,saveLinksToFolder,createFolder}=await import('./folders.js');
  const{showImportModal}=await import('./import.js');
  const folders=await getFolders();
  showImportModal(folders,async(links,fTarget,isNew,opts={})=>{
    let fid=fTarget;
    if(isNew){ const nf=await createFolder(fTarget); fid=nf?.id; }
    if(!fid)return;
    const added=await saveLinksToFolder(fid,links,opts);
    toast(`${added} link${added!==1?'s':''} saved!`,'success');
  });
}

// ── More menu popup (mobile) ──────────────────────────────
function showMoreMenu(user){
  document.querySelector('.more-menu-backdrop')?.remove();
  const bd=document.createElement('div');
  bd.className='more-menu-backdrop';
  bd.innerHTML=`
    <div class="more-menu-sheet">
      <div class="more-menu-handle"></div>
      <div class="more-menu-title">More</div>
      <div class="more-menu-grid">
        <button class="more-menu-item" data-page="history"><i class="fa-solid fa-clock-rotate-left"></i><span>History</span></button>
        <button class="more-menu-item" data-page="settings"><i class="fa-solid fa-gear"></i><span>Settings</span></button>
        <button class="more-menu-item" id="more-recycle"><i class="fa-solid fa-trash-can"></i><span>Bin</span></button>
        <button class="more-menu-item" id="more-import"><i class="fa-solid fa-file-import"></i><span>Import</span></button>
        <button class="more-menu-item" id="more-profile"><i class="fa-solid fa-user-circle"></i><span>Profile</span></button>
        <button class="more-menu-item" id="more-theme" data-action="toggle-theme"><i class="fa-solid fa-moon"></i><span>Theme</span></button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  _syncThemeIcon();

  bd.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{ bd.remove(); Router.go(btn.dataset.page); }));
  bd.querySelector('#more-recycle')?.addEventListener('click',async()=>{ bd.remove(); const{showRecycleBin}=await import('./links.js'); showRecycleBin(); });
  bd.querySelector('#more-import')?.addEventListener('click',()=>{ bd.remove(); _triggerImport(); });
  bd.querySelector('#more-profile')?.addEventListener('click',()=>{ bd.remove(); showProfileSheet(user); });
  bd.querySelector('#more-theme')?.addEventListener('click',()=>{ Theme.toggle(); _syncThemeIcon(); bd.remove(); });
  bd.addEventListener('click',e=>{ if(e.target===bd) bd.remove(); });
}

// ── Sidebar collapse ──────────────────────────────────────
function initSidebar(){
  const sb=document.getElementById('sidebar');if(!sb)return;
  const collapsed=Storage.get('sidebarCollapsed',false);
  if(collapsed) sb.classList.add('collapsed');

  const btn=document.createElement('button');
  btn.className='sb-collapse-btn'; btn.title='Toggle sidebar';
  btn.innerHTML='<i class="fa-solid fa-chevron-left"></i>';
  sb.appendChild(btn);
  btn.addEventListener('click',()=>{
    const c=sb.classList.toggle('collapsed');
    Storage.set('sidebarCollapsed',c);
  });
}

// ── Profile sheet ─────────────────────────────────────────
async function showProfileSheet(user){
  if(!user)return;
  document.getElementById('profile-sheet-backdrop')?.remove();

  const name=(user.displayName||'User'),email=(user.email||''),photo=(user.photoURL||'');
  const init=(name[0]||'U').toUpperCase();
  const provider=user.providerData?.[0]?.providerId||'password';

  const bd=document.createElement('div');
  bd.id='profile-sheet-backdrop';
  bd.innerHTML=`
    <div id="profile-sheet">
      <div class="profile-handle"></div>
      <div style="padding:0 var(--sp-5) var(--sp-4)">
        <div class="profile-cover"></div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px">
          <div class="profile-avatar-wrap">
            <div class="avatar avatar-lg">
              ${photo?`<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:init}
            </div>
          </div>
          <div style="font-size:var(--fs-lg);font-weight:800;color:var(--text)">${escapeHtml(name)}</div>
          <div style="font-size:var(--fs-sm);color:var(--text-muted)">${escapeHtml(email)}</div>
          <div style="font-size:10px;color:var(--text-subtle)">via ${provider==='google.com'?'Google':'Email'}</div>
        </div>
      </div>

      <div style="padding:0 var(--sp-4) var(--sp-2)">
        <div class="profile-stat-row" id="ps-stats">
          <div class="profile-stat"><div class="profile-stat-num" id="ps-folders">—</div><div class="profile-stat-lbl">Folders</div></div>
          <div class="profile-stat"><div class="profile-stat-num" id="ps-links">—</div><div class="profile-stat-lbl">Links</div></div>
          <div class="profile-stat"><div class="profile-stat-num" id="ps-history">—</div><div class="profile-stat-lbl">Opened</div></div>
        </div>
      </div>

      <div style="height:1px;background:var(--border);margin:var(--sp-2) var(--sp-4)"></div>

      <div style="padding:0 var(--sp-4) var(--sp-4);display:flex;flex-direction:column;gap:2px">
        <button class="profile-menu-item" id="ps-edit-name"><i class="fa-solid fa-pencil"></i> Edit Display Name</button>
        <button class="profile-menu-item" id="ps-settings"><i class="fa-solid fa-gear"></i> Settings</button>
        <button class="profile-menu-item" id="ps-history"><i class="fa-solid fa-clock-rotate-left"></i> History</button>
        <button class="profile-menu-item" id="ps-export"><i class="fa-solid fa-file-export"></i> Export my data</button>
        <div style="height:1px;background:var(--border);margin:4px 0"></div>
        <button class="profile-menu-item danger" id="ps-logout"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button>
      </div>
    </div>`;
  document.body.appendChild(bd);

  // Load stats
  _loadStats(user.uid, bd);

  // Bindings
  bd.addEventListener('click',e=>{ if(e.target===bd) bd.remove(); });
  bd.querySelector('#ps-edit-name')?.addEventListener('click',async()=>{
    const{prompt:uiPrompt}=await import('./utils.js');
    const newName=await uiPrompt('Edit Display Name','Your name',name);
    if(!newName||newName===name)return;
    try{
      const{updateProfile}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await updateProfile(user,{displayName:newName});
      await update(ref(db,`users/${user.uid}/profile`),{displayName:newName});
      document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=newName);
      toast('Name updated!','success');
    }catch{ toast('Update failed','error'); }
  });
  bd.querySelector('#ps-settings')?.addEventListener('click',()=>{ bd.remove(); Router.go('settings'); });
  bd.querySelector('#ps-history')?.addEventListener('click',()=>{ bd.remove(); Router.go('history'); });
  bd.querySelector('#ps-export')?.addEventListener('click',()=>{ bd.remove(); Router.go('settings'); setTimeout(()=>document.getElementById('st-export-btn')?.click(),400); });
  bd.querySelector('#ps-logout')?.addEventListener('click',async()=>{
    bd.remove();
    const{confirm:uiConfirm}=await import('./utils.js');
    if(await uiConfirm('Sign Out','Are you sure?',false)) logout();
  });
}

async function _loadStats(uid,container){
  try{
    const[fSnap,hSnap]=await Promise.all([get(ref(db,`users/${uid}/folders`)),get(ref(db,`users/${uid}/history`))]);
    const folders=fSnap.exists()?Object.values(fSnap.val()):[];
    container.querySelector('#ps-folders').textContent=folders.length;
    container.querySelector('#ps-links').textContent=folders.reduce((a,f)=>a+(f.linkCount||0),0);
    container.querySelector('#ps-history').textContent=hSnap.exists()?Object.keys(hSnap.val()).length:0;
  }catch{}
}

// ── App Lock ──────────────────────────────────────────────
function initAppLock(){
  const pin=Storage.get('appLockPin');
  const autoMin=Storage.get('autoLockMin',0);
  const lastTs=Storage.get('lastActiveTs',Date.now());
  if(!pin)return;

  // 10-minute reload grace: if reloaded within 10 min, don't lock
  const elapsedMin=(Date.now()-lastTs)/60000;
  const GRACE_MIN=10;
  const shouldLock = autoMin>0 && elapsedMin>autoMin && elapsedMin>GRACE_MIN;
  if(shouldLock) showAppLockScreen(pin);

  const upd=()=>Storage.set('lastActiveTs',Date.now());
  ['click','keydown','touchstart'].forEach(ev=>document.addEventListener(ev,upd,{passive:true}));

  const lockBtn=document.getElementById('topbar-lock-btn');
  if(lockBtn){
    lockBtn.classList.remove('hidden');
    lockBtn.addEventListener('click',()=>{
      lockBtn.querySelector('i')?.classList.add('lock-anim');
      setTimeout(()=>lockBtn.querySelector('i')?.classList.remove('lock-anim'),600);
      showAppLockScreen(pin);
    });
  }
}

export function showAppLockScreen(pin){
  document.getElementById('app-lock-screen')?.remove();
  const sc=document.createElement('div');sc.id='app-lock-screen';
  sc.innerHTML=`
    <div class="lock-icon"><i class="fa-solid fa-lock"></i></div>
    <div style="text-align:center">
      <div style="font-size:var(--fs-2xl);font-weight:800;color:var(--text)">Linkivo is locked</div>
      <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:4px">Enter your 6-digit PIN to unlock</div>
    </div>
    <div class="lock-pin-dots" id="ld">${[0,1,2,3,4,5].map(i=>`<div class="lock-pin-dot" data-i="${i}"></div>`).join('')}</div>
    <input type="password" id="lpi" inputmode="numeric" maxlength="6" pattern="[0-9]*" autocomplete="off"
      style="opacity:0;position:absolute;pointer-events:none;width:1px;height:1px">
    <button class="btn btn-primary btn-lg" id="lfb"><i class="fa-solid fa-keyboard"></i> Tap to enter PIN</button>
    <button class="btn btn-ghost btn-sm" id="llb" style="color:var(--text-muted)">Sign out instead</button>`;
  document.body.appendChild(sc);

  const inp=sc.querySelector('#lpi');const dots=sc.querySelectorAll('.lock-pin-dot');
  sc.querySelector('#lfb').addEventListener('click',()=>inp.focus());
  inp.focus();

  inp.addEventListener('input',()=>{
    const v=inp.value.replace(/\D/g,'').slice(0,6);inp.value=v;
    dots.forEach((d,i)=>{ d.classList.toggle('filled',i<v.length); d.classList.remove('error'); });
    if(v.length===6){
      if(v===pin){
        sc.style.animation='fadeOut 0.3s ease forwards';
        setTimeout(()=>sc.remove(),300);
        Storage.set('lastActiveTs',Date.now());
      } else {
        dots.forEach(d=>d.classList.add('error'));
        setTimeout(()=>{ inp.value=''; dots.forEach(d=>{d.classList.remove('filled','error');}); inp.focus(); },700);
      }
    }
  });
  sc.querySelector('#llb').addEventListener('click',()=>{ sc.remove(); logout(); });
}

// ── Clipboard suggestion ──────────────────────────────────
async function _clipboardSuggestion(){
  try{
    const text=await readClipboard();if(!text)return;
    const url=validateAndNormalizeUrl(text.trim());if(!url)return;
    const c=document.getElementById('toast-container');if(!c)return;
    const el=document.createElement('div');
    el.className='toast toast-info';
    el.style.cssText='max-width:360px;cursor:pointer;flex-direction:column;align-items:flex-start;gap:8px';
    el.innerHTML=`
      <div style="display:flex;align-items:center;gap:8px;width:100%">
        <i class="fa-solid fa-clipboard toast-icon" style="color:#3b82f6"></i>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:12px">Link detected in clipboard</div>
          <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:240px">${url}</div>
        </div>
        <button class="btn btn-primary btn-sm" id="clip-save" style="font-size:11px;padding:4px 8px;flex-shrink:0">Save</button>
      </div>`;
    c.appendChild(el);
    const rm=()=>{ el.classList.add('toast-out'); setTimeout(()=>el.remove(),220); };
    setTimeout(rm,8000); el.addEventListener('click',e=>{ if(!e.target.closest('#clip-save')) rm(); });
    el.querySelector('#clip-save')?.addEventListener('click',e=>{ e.stopPropagation(); rm(); _triggerImport(); });
  }catch{}
}

// ── Theme icon sync ───────────────────────────────────────
function _syncThemeIcon(){
  const dark=Theme.current()==='dark';
  document.querySelectorAll('[data-action="toggle-theme"] i').forEach(i=>i.className=dark?'fa-solid fa-sun':'fa-solid fa-moon');
  document.querySelectorAll('.logo-light').forEach(el=>el.classList.toggle('hidden',dark));
  document.querySelectorAll('.logo-dark').forEach(el=>el.classList.toggle('hidden',!dark));
}

boot().catch(console.error);
