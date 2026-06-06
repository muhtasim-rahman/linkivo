// ============================================================
// Linkivo — app.js  v1.4.5
// Main entry: auth, sidebar collapse, More menu, profile sheet,
// header tab title, theme, app lock, all critical bug fixes
// ============================================================

import Config from '/config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth, db, ref, get, update, onValue } from '/firebase-init.js';
import { initAuthUI, logout, getCurrentUser, resetPassword } from '/auth.js';
import Router from '/router.js';
import { Theme, Storage, toast, registerSW, showDropdown, escapeHtml, initNetworkStatus, purgeExpiredRecycleBin, readClipboard, validateAndNormalizeUrl } from '/utils.js';

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
    if(s.showLinkUrls!==undefined)    Storage.set('showLinkUrls',s.showLinkUrls);
    if(s.openLinksNewTab!==undefined) Storage.set('openLinksNewTab',s.openLinksNewTab);
    if(s.historyMax)    Storage.set('historyMax',s.historyMax);
    if(s.linkSort)      Storage.set('linkSort',s.linkSort);
    if(s.linkView)      Storage.set('linkView',s.linkView);
    if(s.autoLockMin!==undefined) Storage.set('autoLockMin',s.autoLockMin);
    // Sync app PIN from Firebase (source of truth)
    if(s.appLockPin)    Storage.set('appLockPin',s.appLockPin);
    else if(s.appLockPin===null) Storage.remove?.('appLockPin');
  }catch{}
}

// ── Router ────────────────────────────────────────────────
function initRouter(user){
  Router.register('home',    {onEnter:()=>window.HomeModule?.init?.()});
  Router.register('random',  {onEnter:(p)=>window.RandomModule?.init?.(p)});
  Router.register('history', {onEnter:()=>window.HistoryModule?.init?.()});
  Router.register('settings',    {onEnter:()=>window.SettingsModule?.init?.()});
  Router.register('recycle-bin', {onEnter:()=>window.RecycleBinModule?.init?.()});
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


// ── PIN gate (app-level) ──────────────────────────────────
async function _requirePinIfSet(label='this action'){
  const pin=Storage.get('appLockPin');
  if(!pin)return true;
  const{pinDialog,toast:t}=await import('/utils.js');
  const entered=await pinDialog(`Confirm: ${label}`,'Enter your 4-digit App PIN',{digits:4});
  if(!entered)return false;
  if(entered!==pin){t('Wrong PIN','error');return false;}
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
      const{confirm}=await import('/utils.js');
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
  const rbHandler=()=>{ window.Router?.go?.('recycle-bin'); };
  document.getElementById('recycle-bin-btn')?.addEventListener('click',rbHandler);
  document.getElementById('sidebar-recycle-btn')?.addEventListener('click',rbHandler);
}

// ── Import trigger (FAB fixed) ─────────────────────────────
async function _triggerImport(){
  const{getFolders,saveLinksToFolder,createFolder}=await import('/folders.js');
  const{showImportModal}=await import('/import.js');
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
  if(document.querySelector('.more-menu-backdrop')) return; // dedup guard
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
        <button class="more-menu-item" id="more-recycle"><i class="fa-solid fa-trash-can"></i><span>Recycle</span></button>
        <button class="more-menu-item" id="more-import"><i class="fa-solid fa-file-import"></i><span>Import</span></button>
        <button class="more-menu-item" id="more-profile"><i class="fa-solid fa-user-circle"></i><span>Profile</span></button>
        <button class="more-menu-item" id="more-theme" data-action="toggle-theme"><i class="fa-solid fa-moon"></i><span>Theme</span></button>
        <button class="more-menu-item" id="more-search"><i class="fa-solid fa-magnifying-glass"></i><span>Search</span></button>
        <button class="more-menu-item" id="more-random" data-page="random"><i class="fa-solid fa-shuffle"></i><span>Random</span></button>
      </div>
    </div>`;
  document.body.appendChild(bd);
  window.Router?.pushModalState?.();
  _syncThemeIcon();

  bd.querySelectorAll('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{ bd.remove(); Router.go(btn.dataset.page); }));
  bd.querySelector('#more-recycle')?.addEventListener('click',()=>{ bd.remove(); window.Router?.go?.('recycle-bin'); });
  bd.querySelector('#more-import')?.addEventListener('click',()=>{ bd.remove(); _triggerImport(); });
  bd.querySelector('#more-profile')?.addEventListener('click',()=>{ bd.remove(); showProfileSheet(user); });
  bd.querySelector('#more-theme')?.addEventListener('click',()=>{ Theme.toggle(); _syncThemeIcon(); bd.remove(); });
  bd.addEventListener('click',e=>{ if(e.target===bd) bd.remove(); });

  // Swipe down to close
  let _msY=0;
  bd.querySelector('.more-menu-sheet').addEventListener('touchstart',e=>{_msY=e.touches[0].clientY;},{passive:true});
  bd.querySelector('.more-menu-sheet').addEventListener('touchmove',e=>{
    if(e.touches[0].clientY-_msY>60){bd.remove();}
  },{passive:true});

  bd.querySelector('#more-search')?.addEventListener('click',()=>{
    bd.remove();
    document.getElementById('global-search-btn')?.click();
  });
}

// ── Sidebar collapse ──────────────────────────────────────
function initSidebar(){
  const sb=document.getElementById('sidebar');if(!sb)return;
  const collapsed=Storage.get('sidebarCollapsed',false);
  if(collapsed) sb.classList.add('collapsed');

  // Logo click = toggle collapse/expand
  const logo=sb.querySelector('.sidebar-logo');
  if(logo){
    logo.addEventListener('click',()=>{
      const c=sb.classList.toggle('collapsed');
      Storage.set('sidebarCollapsed',c);
    });
  }

  // Add data-tooltip to nav items for collapsed tooltip CSS
  sb.querySelectorAll('.sidebar-nav-item').forEach(item=>{
    const label=item.querySelector('.sidebar-nav-label');
    if(label&&!item.dataset.tooltip){
      item.dataset.tooltip=label.textContent.trim();
    }
  });
}

// ── Profile sheet ─────────────────────────────────────────
async function showProfileSheet(user){
  if(!user)return;
  if(document.getElementById('profile-sheet-backdrop')) return;

  const name    = user.displayName||'User';
  const email   = user.email||'';
  const photo   = user.photoURL||'';
  const init    = (name[0]||'U').toUpperCase();
  const provider= user.providerData?.[0]?.providerId||'password';
  const pLabel  = provider==='google.com'?'Google':'Email';

  const bd=document.createElement('div');
  bd.id='profile-sheet-backdrop';
  bd.className='profile-sheet-backdrop';
  bd.innerHTML=`
    <div id="profile-sheet" class="profile-sheet">
      <div class="profile-handle"></div>

      <!-- Avatar + name -->
      <div class="profile-sheet-head">
        <div class="profile-avatar-wrap">
          <div class="avatar avatar-xl">
            ${photo?`<img src="${photo}" alt="${init}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:init}
          </div>
          <button class="profile-photo-btn" id="ps-photo-btn" title="Upload photo">
            <i class="fa-solid fa-camera"></i>
          </button>
        </div>
        <div class="profile-sheet-identity">
          <div class="profile-name-row">
            <span class="profile-sheet-name">${escapeHtml(name)}</span>
            <button class="btn btn-ghost btn-icon" id="ps-edit-name" style="font-size:13px;width:28px;height:28px" title="Edit name">
              <i class="fa-solid fa-pencil"></i>
            </button>
          </div>
          <div class="profile-sheet-email">${escapeHtml(email)}</div>
          <span class="profile-provider-badge">
            <i class="fa-${provider==='google.com'?'brands fa-google':'solid fa-envelope'}"></i> ${pLabel}
          </span>
        </div>
      </div>

      <!-- Stats -->
      <div class="profile-stat-row" id="ps-stats">
        <div class="profile-stat"><div class="profile-stat-num" id="ps-folders">—</div><div class="profile-stat-lbl">Folders</div></div>
        <div class="profile-stat"><div class="profile-stat-num" id="ps-links">—</div><div class="profile-stat-lbl">Links</div></div>
        <div class="profile-stat"><div class="profile-stat-num" id="ps-history">—</div><div class="profile-stat-lbl">Opened</div></div>
      </div>

      <div class="profile-divider"></div>

      <!-- Account info -->
      <div class="profile-account-info" id="ps-account-info">
        <div class="profile-info-row">
          <i class="fa-solid fa-calendar-days"></i>
          <span id="ps-joined">Loading…</span>
        </div>
      </div>

      <div class="profile-divider"></div>

      <!-- Quick actions grid -->
      <div class="profile-actions-grid">
        <button class="profile-action-btn" id="ps-settings">
          <i class="fa-solid fa-gear"></i><span>Settings</span>
        </button>
        <button class="profile-action-btn" id="ps-history-btn">
          <i class="fa-solid fa-clock-rotate-left"></i><span>History</span>
        </button>
        <button class="profile-action-btn" id="ps-export">
          <i class="fa-solid fa-file-export"></i><span>Export</span>
        </button>
        <button class="profile-action-btn" id="ps-recycle">
          <i class="fa-solid fa-trash-can"></i><span>Recycle</span>
        </button>
      </div>

      <div class="profile-divider"></div>

      <!-- Sign out -->
      <button class="profile-signout-btn" id="ps-logout">
        <i class="fa-solid fa-right-from-bracket"></i> Sign Out
      </button>
    </div>`;

  document.body.appendChild(bd);
  window.Router?.pushModalState?.();
  _loadStats(user.uid, bd);
  _loadProfileInfo(user.uid, bd);

  // Close on backdrop click
  bd.addEventListener('click',e=>{ if(e.target===bd) bd.remove(); });

  // Swipe sheet down to close
  let _sy=0;
  bd.querySelector('#profile-sheet').addEventListener('touchstart',e=>{_sy=e.touches[0].clientY;},{passive:true});
  bd.querySelector('#profile-sheet').addEventListener('touchmove',e=>{if(e.touches[0].clientY-_sy>80)bd.remove();},{passive:true});

  // Photo upload button (placeholder — full impl in Part 8)
  bd.querySelector('#ps-photo-btn')?.addEventListener('click',()=>{
    _triggerProfilePhotoUpload(user, bd);
  });

  // Edit name
  bd.querySelector('#ps-edit-name')?.addEventListener('click',async()=>{
    const{prompt:uiPrompt}=await import('/utils.js');
    const newName=await uiPrompt('Edit Name','Your display name',name);
    if(!newName||newName===name)return;
    try{
      const{updateProfile}=await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await updateProfile(user,{displayName:newName});
      await update(ref(db,`users/${user.uid}/profile`),{displayName:newName,updatedAt:Date.now()});
      document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=newName);
      toast('Name updated','success');
      bd.querySelector('.profile-sheet-name').textContent=newName;
    }catch{ toast('Update failed','error'); }
  });

  bd.querySelector('#ps-settings')?.addEventListener('click',()=>{ bd.remove(); Router.go('settings'); });
  bd.querySelector('#ps-history-btn')?.addEventListener('click',()=>{ bd.remove(); Router.go('history'); });
  bd.querySelector('#ps-export')?.addEventListener('click',()=>{ bd.remove(); Router.go('settings'); setTimeout(()=>document.getElementById('st-export-btn')?.click(),400); });
  bd.querySelector('#ps-recycle')?.addEventListener('click',()=>{ bd.remove(); Router.go('recycle-bin'); });

  bd.querySelector('#ps-logout')?.addEventListener('click',async()=>{
    bd.remove();
    const{confirm:uiConfirm}=await import('/utils.js');
    if(!await uiConfirm('Sign Out','Are you sure?',false)) return;
    if(!await _requirePinIfSet('Sign Out')) return;
    logout();
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

async function _loadProfileInfo(uid, container) {
  try {
    const snap = await get(ref(db, `users/${uid}/profile`));
    const profile = snap.exists() ? snap.val() : {};
    const createdAt = profile.createdAt || null;
    const el = container.querySelector('#ps-joined');
    if (el) {
      el.textContent = createdAt
        ? 'Joined ' + new Date(createdAt).toLocaleDateString('en-US', {month:'long',year:'numeric'})
        : 'Account info unavailable';
    }
  } catch {}
}

async function _triggerProfilePhotoUpload(user, container) {
  const CF_WORKER = 'https://linkivo.programs-turzo.workers.dev/';
  // Lazy-load Cropper.js
  const cropperSrc = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js';
  const cropperCss = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css';

  if (!document.getElementById('cropper-css')) {
    const link = document.createElement('link');
    link.id = 'cropper-css'; link.rel = 'stylesheet'; link.href = cropperCss;
    document.head.appendChild(link);
  }

  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Load Cropper.js dynamically
    if (!window.Cropper) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = cropperSrc; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }

    // Show crop modal
    const cropBd = document.createElement('div');
    cropBd.className = 'modal-backdrop';
    cropBd.style.zIndex = '99999';
    cropBd.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <span class="modal-title"><i class="fa-solid fa-crop"></i> Crop Photo</span>
        </div>
        <div class="modal-body" style="padding:0;overflow:hidden;border-radius:0 0 var(--r-lg) var(--r-lg)">
          <div style="max-height:340px;overflow:hidden">
            <img id="crop-img" style="max-width:100%;display:block">
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary btn-sm" id="crop-cancel">Cancel</button>
          <span id="crop-upload-status" style="font-size:12px;color:var(--text-muted);flex:1;text-align:center"></span>
          <button class="btn btn-primary btn-sm" id="crop-save">Upload Photo</button>
        </div>
      </div>`;
    document.body.appendChild(cropBd);

    const img = cropBd.querySelector('#crop-img');
    img.src = URL.createObjectURL(file);

    await new Promise(res => { img.onload = res; });
    const cropper = new window.Cropper(img, { aspectRatio: 1, viewMode: 1 });

    cropBd.querySelector('#crop-cancel').onclick = () => { cropper.destroy(); cropBd.remove(); };
    cropBd.querySelector('#crop-save').onclick = async () => {
      const statusEl = cropBd.querySelector('#crop-upload-status');
      const btn      = cropBd.querySelector('#crop-save');
      btn.disabled   = true;
      statusEl.textContent = 'Compressing…';

      // Crop to canvas → blob
      const canvas = cropper.getCroppedCanvas({ width: 400, height: 400 });
      const blob   = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));

      statusEl.textContent = 'Uploading…';
      try {
        const name = `linkivo_profile_photo_${user.uid}_${Date.now()}`;
        const fd   = new FormData();
        fd.append('image', blob, name + '.jpg');
        fd.append('name', name);
        const res  = await fetch(CF_WORKER, { method: 'POST', body: fd });
        const data = await res.json();
        const url  = data.data?.url;
        if (!url) throw new Error('No URL');

        // Save to Firebase Auth + DB
        const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        await updateProfile(user, { photoURL: url });
        await update(ref(db, `users/${user.uid}/profile`), { photoURL: url, updatedAt: Date.now() });

        // Append to photo history
        const histRef = ref(db, `users/${user.uid}/profile/photoHistory`);
        const histSnap = await get(histRef);
        const hist = histSnap.exists() ? histSnap.val() : [];
        hist.unshift({ url, uploadedAt: Date.now() });
        await update(ref(db, `users/${user.uid}/profile`), { photoHistory: hist.slice(0, 10) });

        // Refresh avatars
        document.querySelectorAll('.user-avatar').forEach(el => {
          el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
        });
        const sheetAvatar = container?.querySelector('.avatar');
        if (sheetAvatar) sheetAvatar.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;

        toast('Photo updated!', 'success');
        cropper.destroy(); cropBd.remove();
      } catch {
        statusEl.textContent = 'Upload failed';
        btn.disabled = false;
      }
    };
  };
  input.click();
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
  const DIGITS=4;
  const sc=document.createElement('div');sc.id='app-lock-screen';
  sc.innerHTML=`
    <div class="lock-icon"><i class="fa-solid fa-lock"></i></div>
    <div style="text-align:center">
      <div style="font-size:var(--fs-2xl);font-weight:800;color:var(--text)">Linkivo is locked</div>
      <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:4px">Enter your 4-digit PIN to unlock</div>
    </div>
    <div class="lock-pin-dots" id="ld">${[...Array(DIGITS)].map((_,i)=>`<div class="lock-pin-dot" data-i="${i}"></div>`).join('')}</div>
    <input type="text" id="lpi" inputmode="numeric" pattern="[0-9]*"
      maxlength="${DIGITS}" autocomplete="one-time-code"
      autocorrect="off" autocapitalize="off" spellcheck="false"
      data-1p-ignore="true" data-lpignore="true"
      style="opacity:0;position:absolute;pointer-events:none;width:1px;height:1px">
    <button class="btn btn-primary btn-lg" id="lfb"><i class="fa-solid fa-keyboard"></i> Tap to enter PIN</button>
    <button class="btn btn-ghost btn-sm" id="llb" style="color:var(--text-muted)">Sign out instead</button>`;
  document.body.appendChild(sc);

  const inp=sc.querySelector('#lpi');const dots=sc.querySelectorAll('.lock-pin-dot');
  sc.querySelector('#lfb').addEventListener('click',()=>inp.focus());
  inp.focus();

  inp.addEventListener('input',()=>{
    const v=inp.value.replace(/\D/g,'').slice(0,DIGITS);inp.value=v;
    dots.forEach((d,i)=>{ d.classList.toggle('filled',i<v.length); d.classList.remove('error'); });
    if(v.length===DIGITS){
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

boot().catch(err => {
  console.error('[Linkivo] boot failed:', err);
  // Show auth as fallback so user sees something useful
  document.getElementById('auth-container')?.classList.remove('hidden');
});
