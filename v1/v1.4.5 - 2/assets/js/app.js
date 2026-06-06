// ============================================================
// Linkivo — app.js  v1.4.5
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
}

async function showApp(user){
  document.getElementById('auth-container')?.classList.add('hidden');
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
    if(s.showLinkUrls!==undefined)   Storage.set('showLinkUrls',s.showLinkUrls);
    if(s.openLinksNewTab!==undefined) Storage.set('openLinksNewTab',s.openLinksNewTab);
    if(s.historyMax)     Storage.set('historyMax',s.historyMax);
    if(s.autoClearHistoryDays!==undefined) Storage.set('autoClearHistoryDays',s.autoClearHistoryDays);
    if(s.incognitoMode!==undefined) Storage.set('incognitoMode',s.incognitoMode);
    // App PIN + auto-lock timer synced from Firebase
    if(s.appPin)         Storage.set('appLockPin',s.appPin);
    if(s.autoLockMin!==undefined) Storage.set('autoLockMin',s.autoLockMin);
  }catch{}
}

// Helper: save a settings value both to localStorage AND Firebase
export async function syncSetting(uid, key, value){
  Storage.set(key, value);
  try{ await update(ref(db,`users/${uid}/settings`),{[key]:value}); }catch{}
}

// ── Router ────────────────────────────────────────────────
function initRouter(user){
  Router.register('home',       {onEnter:()=>window.HomeModule?.init?.()});
  Router.register('random',     {onEnter:()=>window.RandomModule?.init?.()});
  Router.register('history',    {
    onEnter:()=>window.HistoryModule?.init?.(),
    onLeave:()=>window.HistoryModule?.leave?.(),
  });
  Router.register('settings',   {onEnter:()=>window.SettingsModule?.init?.()});
  Router.register('recyclebin', {onEnter:()=>window.RecycleBinModule?.init?.()});
  Router.register('folder',     {
    onEnter:p=>{
      if(p?.folder) window.FolderModule?.open?.(p);
      else if(p?.folderId) _openFolderById(p.folderId);
    },
    onLeave:()=>window.FolderModule?.leave?.(),
  });
  window.Router=Router;
  Router.init('home');
}

async function _openFolderById(fid){
  const user=getCurrentUser();if(!user)return;
  const snap=await get(ref(db,`users/${user.uid}/folders/${fid}`));
  if(snap.exists()) window.FolderModule?.open?.({folder:snap.val()});
  else Router.go('home');
}


// ── PIN gate (app-level) ──────────────────────────────────
async function _requirePinIfSet(label='this action'){
  const pin=Storage.get('appLockPin');
  if(!pin)return true;
  const{pinDialog}=await import('./utils.js');
  const entered=await pinDialog(`Confirm: ${label}`,'Enter your app PIN to continue');
  if(!entered)return false;
  if(entered!==pin){const{toast:t}=await import('./utils.js');t('Wrong PIN','error');return false;}
  return true;
}

// ── Global actions ────────────────────────────────────────
function bindGlobalActions(user){
  // Theme toggle
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn=>{
    btn.addEventListener('click',()=>{ Theme.toggle(); _syncThemeIcon(); });
  });
  _syncThemeIcon();

  // Logout — PIN gated
  document.querySelectorAll('[data-action="logout"]').forEach(btn=>{
    btn.addEventListener('click',async()=>{
      const{confirm}=await import('./utils.js');
      if(!await confirm('Sign Out','Are you sure you want to sign out?',false)) return;
      if(!await _requirePinIfSet('Sign Out')) return;
      logout();
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
  // Recycle bin → navigate to full page (no more popup)
  const rbHandler = () => Router.go('recyclebin');
  document.getElementById('recycle-bin-btn')?.addEventListener('click', rbHandler);
  document.getElementById('sidebar-recycle-btn')?.addEventListener('click', rbHandler);
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
    <div class="more-menu-sheet" id="more-menu-sheet">
      <div class="more-menu-handle"></div>
      <div class="more-menu-title">More</div>
      <div class="more-menu-grid">
        <button class="more-menu-item" data-page="history"><i class="fa-solid fa-clock-rotate-left"></i><span>History</span></button>
        <button class="more-menu-item" data-page="settings"><i class="fa-solid fa-gear"></i><span>Settings</span></button>
        <button class="more-menu-item" id="more-recycle"><i class="fa-solid fa-trash-can"></i><span>Recycle Bin</span></button>
        <button class="more-menu-item" id="more-import"><i class="fa-solid fa-file-import"></i><span>Import</span></button>
        <button class="more-menu-item" id="more-profile"><i class="fa-solid fa-user-circle"></i><span>Profile</span></button>
        <button class="more-menu-item" id="more-theme" data-action="toggle-theme"><i class="fa-solid fa-moon"></i><span>Theme</span></button>
        <button class="more-menu-item" id="more-search"><i class="fa-solid fa-magnifying-glass"></i><span>Search</span></button>
        <button class="more-menu-item" id="more-new-folder"><i class="fa-solid fa-folder-plus"></i><span>New Folder</span></button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  _syncThemeIcon();

  // Animate sheet up
  const sheet = bd.querySelector('#more-menu-sheet');
  sheet.style.transform = 'translateY(100%)';
  requestAnimationFrame(() => {
    sheet.style.transition = 'transform 0.3s cubic-bezier(0.34,1.1,0.64,1)';
    sheet.style.transform  = 'translateY(0)';
  });

  const close = () => {
    sheet.style.transition = 'transform 0.22s ease-in';
    sheet.style.transform  = 'translateY(100%)';
    setTimeout(() => bd.remove(), 220);
  };

  // Register with router for back-button support
  Router.pushModal(close);

  bd.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{ close(); setTimeout(()=>Router.go(btn.dataset.page),100); }));
  bd.querySelector('#more-recycle')?.addEventListener('click',()=>{ close(); setTimeout(()=>Router.go('recyclebin'),100); });
  bd.querySelector('#more-import')?.addEventListener('click',()=>{ close(); setTimeout(_triggerImport,100); });
  bd.querySelector('#more-profile')?.addEventListener('click',()=>{ close(); setTimeout(()=>showProfileSheet(user),100); });
  bd.querySelector('#more-theme')?.addEventListener('click',()=>{ Theme.toggle(); _syncThemeIcon(); close(); });
  bd.querySelector('#more-search')?.addEventListener('click',()=>{ close(); setTimeout(()=>document.getElementById('global-search-input')?.closest('#global-search-overlay')?.classList.remove('hidden')||document.getElementById('global-search-input')?.focus(),100); });
  bd.querySelector('#more-new-folder')?.addEventListener('click',()=>{ close(); setTimeout(()=>document.getElementById('create-folder-btn')?.click(),150); });
  bd.addEventListener('click',e=>{ if(e.target===bd) close(); });

  // Drag-to-dismiss
  let startY=0, dragging=false;
  sheet.addEventListener('touchstart',e=>{ startY=e.touches[0].clientY; dragging=true; },{passive:true});
  sheet.addEventListener('touchmove',e=>{
    if(!dragging)return;
    const dy=e.touches[0].clientY-startY;
    if(dy>0) sheet.style.transform=`translateY(${dy}px)`;
  },{passive:true});
  sheet.addEventListener('touchend',e=>{
    dragging=false;
    const dy=e.changedTouches[0].clientY-startY;
    if(dy>80) close(); else { sheet.style.transition='transform 0.2s ease'; sheet.style.transform='translateY(0)'; }
  });
}

// ── Sidebar collapse ──────────────────────────────────────
function initSidebar(){
  const sb=document.getElementById('sidebar');if(!sb)return;
  const collapsed=Storage.get('sidebarCollapsed',false);
  if(collapsed) sb.classList.add('collapsed');

  // Logo area becomes hover-toggle: shows menu icon on hover, triggers collapse/expand
  const logo=sb.querySelector('.sidebar-logo');
  if(logo){
    logo.title='Toggle sidebar';
    logo.style.cursor='pointer';
    logo.addEventListener('click',()=>{
      const c=sb.classList.toggle('collapsed');
      Storage.set('sidebarCollapsed',c);
    });
  }

  // Collapse arrow button (shown only when expanded, on right side)
  const btn=document.createElement('button');
  btn.className='sb-collapse-btn'; btn.title='Collapse sidebar';
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

  const name    = user.displayName||'User';
  const email   = user.email||'';
  const photo   = user.photoURL||'';
  const init    = (name[0]||'U').toUpperCase();
  const provider= user.providerData?.[0]?.providerId||'password';
  const isPw    = provider==='password';
  const joined  = user.metadata?.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString('en-US',{month:'short',year:'numeric'})
    : '';

  const bd=document.createElement('div');
  bd.id='profile-sheet-backdrop';
  bd.innerHTML=`
    <div id="profile-sheet">
      <div class="profile-handle"></div>

      <!-- Avatar + name header -->
      <div style="padding:var(--sp-5) var(--sp-5) var(--sp-3);text-align:center">
        <div style="position:relative;display:inline-block;margin-bottom:12px">
          <div class="avatar" style="width:72px;height:72px;font-size:28px;font-weight:800;cursor:pointer" id="ps-avatar-btn">
            ${photo?`<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" id="ps-avatar-img">`:`<span>${init}</span>`}
          </div>
          <button id="ps-change-photo" style="position:absolute;bottom:-2px;right:-2px;width:24px;height:24px;border-radius:50%;border:2px solid var(--bg);background:var(--primary);color:#fff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Change photo">
            <i class="fa-solid fa-camera"></i>
          </button>
        </div>
        <div style="font-size:var(--fs-xl);font-weight:800;color:var(--text);line-height:1.2">${escapeHtml(name)}</div>
        <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:2px">${escapeHtml(email)}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px">
          <span style="font-size:10px;background:var(--surface-2);padding:2px 8px;border-radius:999px;color:var(--text-subtle)">
            <i class="fa-solid fa-${provider==='google.com'?'google fab':'envelope'}"></i>
            via ${provider==='google.com'?'Google':'Email'}
          </span>
          ${joined?`<span style="font-size:10px;color:var(--text-subtle)">Joined ${joined}</span>`:''}
        </div>
      </div>

      <!-- Stats row -->
      <div style="display:flex;gap:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
        <div class="profile-stat" style="flex:1;border-right:1px solid var(--border)" id="ps-stat-folders">
          <div class="profile-stat-num" id="ps-folders">—</div>
          <div class="profile-stat-lbl">Folders</div>
        </div>
        <div class="profile-stat" style="flex:1;border-right:1px solid var(--border)" id="ps-stat-links">
          <div class="profile-stat-num" id="ps-links">—</div>
          <div class="profile-stat-lbl">Links</div>
        </div>
        <div class="profile-stat" style="flex:1" id="ps-stat-history">
          <div class="profile-stat-num" id="ps-history">—</div>
          <div class="profile-stat-lbl">Opened</div>
        </div>
      </div>

      <!-- Menu items -->
      <div style="padding:var(--sp-2) var(--sp-4) var(--sp-4);display:flex;flex-direction:column;gap:2px">
        <button class="profile-menu-item" id="ps-edit-name"><i class="fa-solid fa-pencil"></i> Edit Display Name</button>
        ${isPw?'<button class="profile-menu-item" id="ps-change-pw"><i class="fa-solid fa-key"></i> Change Password</button>':''}
        <button class="profile-menu-item" id="ps-security"><i class="fa-solid fa-shield-halved"></i> Security & PIN</button>
        <div style="height:1px;background:var(--border);margin:4px 0"></div>
        <button class="profile-menu-item" id="ps-settings"><i class="fa-solid fa-gear"></i> Settings</button>
        <button class="profile-menu-item" id="ps-history"><i class="fa-solid fa-clock-rotate-left"></i> History</button>
        <button class="profile-menu-item" id="ps-recycle"><i class="fa-solid fa-trash-can"></i> Recycle Bin</button>
        <button class="profile-menu-item" id="ps-export"><i class="fa-solid fa-file-export"></i> Export my data</button>
        <div style="height:1px;background:var(--border);margin:4px 0"></div>
        <button class="profile-menu-item danger" id="ps-logout"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  Router.pushModal(() => bd.remove());

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
      await update(ref(db,`users/${user.uid}/profile`),{displayName:newName,updatedAt:Date.now()});
      document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=newName);
      toast('Name updated!','success');
    }catch{ toast('Update failed','error'); }
  });

  // Change photo — compress + imgbb upload
  bd.querySelector('#ps-change-photo')?.addEventListener('click',async()=>{
    const inp=document.createElement('input');
    inp.type='file'; inp.accept='image/*'; inp.click();
    inp.onchange=async()=>{
      const file=inp.files?.[0]; if(!file)return;
      const{compressImage,uploadToImgbb,toast:t2}=await import('./utils.js');
      t2('Compressing…','info',2000);
      try{
        const compressed=await compressImage(file,{maxDim:256,quality:0.85});
        t2('Uploading…','info',3000);
        const imgUrl=await uploadToImgbb(compressed,`linkivo-${user.uid}-profile-${Date.now()}`);
        const{updateProfile:up2}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        await up2(user,{photoURL:imgUrl});
        await update(ref(db,`users/${user.uid}/profile`),{photoURL:imgUrl,updatedAt:Date.now()});
        // Update avatar in DOM
        document.querySelectorAll('.user-avatar').forEach(el=>{
          el.innerHTML=`<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        });
        const psImg=bd.querySelector('#ps-avatar-img');
        if(psImg){psImg.src=imgUrl;}else{
          const av=bd.querySelector('#ps-avatar-btn');
          if(av)av.innerHTML=`<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" id="ps-avatar-img">
          <button id="ps-change-photo" style="position:absolute;bottom:-2px;right:-2px;width:24px;height:24px;border-radius:50%;border:2px solid var(--bg);background:var(--primary);color:#fff;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-camera"></i></button>`;
        }
        t2('Photo updated!','success');
      }catch(err){ toast('Upload failed: '+err.message,'error'); }
    };
  });

  bd.querySelector('#ps-change-pw')?.addEventListener('click',async()=>{
    bd.remove();
    Router.go('settings');
    setTimeout(()=>document.getElementById('st-reset-pw')?.click(),400);
  });
  bd.querySelector('#ps-security')?.addEventListener('click',()=>{ bd.remove(); Router.go('settings'); });
  bd.querySelector('#ps-settings')?.addEventListener('click',()=>{ bd.remove(); Router.go('settings'); });
  bd.querySelector('#ps-history')?.addEventListener('click',()=>{ bd.remove(); Router.go('history'); });
  bd.querySelector('#ps-recycle')?.addEventListener('click',()=>{ bd.remove(); Router.go('recyclebin'); });
  bd.querySelector('#ps-export')?.addEventListener('click',()=>{ bd.remove(); Router.go('settings'); setTimeout(()=>document.getElementById('st-export-btn')?.click(),400); });
  bd.querySelector('#ps-logout')?.addEventListener('click',async()=>{
    bd.remove();
    const{confirm:uiConfirm}=await import('./utils.js');
    if(!await uiConfirm('Sign Out','Are you sure?',false)) return;
    if(!await _requirePinIfSet('Sign Out')) return;
    logout();
  });

  // Stat clicks navigate to sections
  bd.querySelector('#ps-stat-folders')?.addEventListener('click',()=>{ bd.remove(); Router.go('home'); });
  bd.querySelector('#ps-stat-history')?.addEventListener('click',()=>{ bd.remove(); Router.go('history'); });
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
  // App PIN is 4-digit (folder PIN is 6-digit)
  const DIGITS = 4;
  const dotsHTML = Array.from({length:DIGITS},(_,i)=>`<div class="lock-pin-dot" data-i="${i}"></div>`).join('');
  const sc=document.createElement('div');sc.id='app-lock-screen';
  sc.innerHTML=`
    <div class="lock-icon"><i class="fa-solid fa-lock"></i></div>
    <div style="text-align:center">
      <div style="font-size:var(--fs-2xl);font-weight:800;color:var(--text)">Linkivo is locked</div>
      <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:4px">Enter your ${DIGITS}-digit PIN to unlock</div>
    </div>
    <div class="pin-dots-row" id="ld" style="cursor:pointer">${dotsHTML}</div>
    <!-- type=tel prevents Google password manager from offering to save/autofill -->
    <input type="tel" id="lpi" inputmode="numeric" maxlength="${DIGITS}" pattern="[0-9]*"
      autocomplete="one-time-code" data-lpignore="true" data-1p-ignore="true"
      style="opacity:0;position:absolute;pointer-events:none;width:1px;height:1px">
    <button class="btn btn-primary btn-lg" id="lfb">
      <i class="fa-solid fa-keyboard"></i> Tap to enter PIN
    </button>
    <button class="btn btn-ghost btn-sm" id="llb" style="color:var(--text-muted)">Sign out instead</button>`;
  document.body.appendChild(sc);

  const inp  = sc.querySelector('#lpi');
  const dots = sc.querySelectorAll('.lock-pin-dot');
  const focusInp = () => inp.focus();

  sc.querySelector('#lfb').addEventListener('click', focusInp);
  sc.querySelector('#ld').addEventListener('click', focusInp);
  inp.focus();

  inp.addEventListener('input',()=>{
    const v = inp.value.replace(/\D/g,'').slice(0, DIGITS);
    inp.value = v;
    dots.forEach((d,i) => { d.classList.toggle('filled', i < v.length); d.classList.remove('error'); });
    if (v.length === DIGITS) {
      if (v === pin) {
        sc.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => sc.remove(), 300);
        Storage.set('lastActiveTs', Date.now());
      } else {
        dots.forEach(d => d.classList.add('error'));
        setTimeout(() => {
          inp.value = '';
          dots.forEach(d => { d.classList.remove('filled','error'); });
          inp.focus();
        }, 700);
      }
    }
  });
  sc.querySelector('#llb').addEventListener('click', () => { sc.remove(); logout(); });
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

boot().catch(err => {
  console.error('[Linkivo] boot failed:', err);
  document.getElementById('auth-container')?.classList.remove('hidden');
  document.getElementById('app-container')?.classList.add('hidden');
});;
