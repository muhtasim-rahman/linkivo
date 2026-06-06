// ============================================================
// Linkivo — auth.js  v1.4.2
// Auth: Google, Email/Password, Forgot Password (proper flow)
// Like/Dislike mutual exclusion handled in utils.js
// ============================================================

import { auth, db, googleProvider, signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut, updateProfile,
  ref, set, get, update, serverTimestamp } from './firebase-init.js';
import { toast, Theme, Storage } from './utils.js';

// ── Auth state ────────────────────────────────────────────
let _ready=false, _cbs=[];
export function onAuthReady(cb){ if(_ready){cb(auth.currentUser);return;} _cbs.push(cb); }
onAuthStateChanged(auth,user=>{ _ready=true; _cbs.forEach(c=>c(user)); _cbs=[]; });
export function getCurrentUser(){ return auth.currentUser; }

// ── Ensure user profile ───────────────────────────────────
async function ensureProfile(user){
  const pr=ref(db,`users/${user.uid}/profile`);
  const sn=await get(pr);
  if(!sn.exists()){
    await set(pr,{ uid:user.uid, displayName:user.displayName||'User', email:user.email||'', photoURL:user.photoURL||'', provider:user.providerData?.[0]?.providerId||'password', createdAt:serverTimestamp(), lastSeen:serverTimestamp() });
    await set(ref(db,`users/${user.uid}/settings`),{ theme:Storage.get('theme','light'), accent:'blue', fontSize:'medium', historyMax:500, showLinkUrls:true, openLinksNewTab:false });
  } else {
    await update(ref(db,`users/${user.uid}/profile`),{ lastSeen:serverTimestamp() });
  }
}

// ── Sign-in methods ───────────────────────────────────────
export async function signInWithGoogle(){
  try{ const r=await signInWithPopup(auth,googleProvider); await ensureProfile(r.user); return{user:r.user,error:null}; }
  catch(e){ return{user:null,error:_err(e.code)}; }
}
export async function signInWithEmail(email,password){
  try{ const r=await signInWithEmailAndPassword(auth,email,password); await ensureProfile(r.user); return{user:r.user,error:null}; }
  catch(e){ return{user:null,error:_err(e.code)}; }
}
export async function signUpWithEmail(email,password,displayName){
  try{ const r=await createUserWithEmailAndPassword(auth,email,password); if(displayName)await updateProfile(r.user,{displayName}); await ensureProfile(r.user); return{user:r.user,error:null}; }
  catch(e){ return{user:null,error:_err(e.code)}; }
}
export async function resetPassword(email){
  try{ await sendPasswordResetEmail(auth,email); return{success:true,error:null}; }
  catch(e){ return{success:false,error:_err(e.code)}; }
}
export async function logout(){
  try{ await signOut(auth); toast('Signed out','success'); return true; }
  catch{ toast('Sign out failed','error'); return false; }
}

function _err(code){
  const m={'auth/user-not-found':'No account with this email.','auth/wrong-password':'Incorrect password.','auth/email-already-in-use':'Email already registered.','auth/weak-password':'Password must be at least 6 characters.','auth/invalid-email':'Invalid email address.','auth/too-many-requests':'Too many attempts. Try again later.','auth/network-request-failed':'Network error. Check connection.','auth/popup-closed-by-user':'Sign-in popup was closed.','auth/invalid-credential':'Invalid credentials.'};
  return m[code]||'Something went wrong.';
}

// ══════════════════════════════════════════════════════════
// AUTH UI
// ══════════════════════════════════════════════════════════
export function initAuthUI(){
  // ── Tab switching ─────────────────────────────────────
  document.querySelectorAll('.auth-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('.auth-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.auth-view').forEach(v=>v.classList.remove('active'));
      document.getElementById(`auth-${tab.dataset.view}`)?.classList.add('active');
    });
  });

  // ── Error helpers ─────────────────────────────────────
  function showErr(formId,msg){
    const form=document.getElementById(formId);if(!form)return;
    let el=form.querySelector('.auth-error');
    if(!el){el=document.createElement('div');el.className='auth-error';el.innerHTML='<i class="fa-solid fa-circle-exclamation"></i><span></span>';form.querySelector('.auth-form-body').prepend(el);}
    el.querySelector('span').textContent=msg;el.style.display='flex';
  }
  function clearErr(formId){document.getElementById(formId)?.querySelector('.auth-error')?.remove();}

  function setLoad(btn,on){
    if(on){btn.classList.add('btn-loading');btn.disabled=true;btn.dataset.orig=btn.innerHTML;btn.innerHTML='';}
    else{btn.classList.remove('btn-loading');btn.disabled=false;btn.innerHTML=btn.dataset.orig||'Submit';}
  }

  // ── Login form ────────────────────────────────────────
  const loginForm=document.getElementById('auth-login');
  if(loginForm){
    loginForm.querySelector('#login-google-btn')?.addEventListener('click',async function(){
      setLoad(this,true);const{error}=await signInWithGoogle();setLoad(this,false);
      if(error)showErr('auth-login',error);
    });
    loginForm.querySelector('#login-submit')?.addEventListener('click',async function(){
      clearErr('auth-login');
      const email=loginForm.querySelector('#login-email')?.value.trim();
      const pw=loginForm.querySelector('#login-password')?.value;
      if(!email||!pw){showErr('auth-login','Fill in all fields.');return;}
      setLoad(this,true);const{error}=await signInWithEmail(email,pw);setLoad(this,false);
      if(error)showErr('auth-login',error);
    });
    loginForm.querySelector('#login-password')?.addEventListener('keydown',e=>{ if(e.key==='Enter') loginForm.querySelector('#login-submit')?.click(); });

    // ── FORGOT PASSWORD — proper UI flow ─────────────────
    loginForm.querySelector('#login-forgot')?.addEventListener('click',e=>{
      e.preventDefault();
      const emailVal=loginForm.querySelector('#login-email')?.value.trim()||'';
      _showForgotView(loginForm, emailVal);
    });
  }

  // ── Signup form ───────────────────────────────────────
  const signupForm=document.getElementById('auth-signup');
  if(signupForm){
    const pwInp=signupForm.querySelector('#signup-password');
    pwInp?.addEventListener('input',()=>{
      const s=_strength(pwInp.value);
      signupForm.querySelectorAll('.pw-strength-bar').forEach((b,i)=>{
        b.className='pw-strength-bar';
        if(i<s)b.classList.add(['','w','w','m','s'][s]);
      });
    });
    signupForm.querySelector('#signup-google-btn')?.addEventListener('click',async function(){
      setLoad(this,true);const{error}=await signInWithGoogle();setLoad(this,false);
      if(error)showErr('auth-signup',error);
    });
    signupForm.querySelector('#signup-submit')?.addEventListener('click',async function(){
      clearErr('auth-signup');
      const name=signupForm.querySelector('#signup-name')?.value.trim();
      const email=signupForm.querySelector('#signup-email')?.value.trim();
      const pw=signupForm.querySelector('#signup-password')?.value;
      if(!name||!email||!pw){showErr('auth-signup','Fill in all fields.');return;}
      if(pw.length<6){showErr('auth-signup','Password must be at least 6 characters.');return;}
      setLoad(this,true);const{error}=await signUpWithEmail(email,pw,name);setLoad(this,false);
      if(error)showErr('auth-signup',error);
    });
  }

  // ── Password toggles ──────────────────────────────────
  document.querySelectorAll('.input-toggle-pw').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const inp=btn.closest('.input-password-wrap')?.querySelector('input');
      if(!inp)return;
      inp.type=inp.type==='text'?'password':'text';
      btn.innerHTML=inp.type==='text'?'<i class="fa-solid fa-eye-slash"></i>':'<i class="fa-solid fa-eye"></i>';
    });
  });
}

// ── Forgot password view — replaces login form content ────
function _showForgotView(loginForm, prefillEmail=''){
  const origHTML=loginForm.innerHTML;

  loginForm.innerHTML=`
    <div class="auth-form-header">
      <button class="forgot-back-btn" id="fw-back">
        <i class="fa-solid fa-arrow-left"></i> Back to sign in
      </button>
      <h2 class="auth-form-title" style="margin-top:10px">Reset password</h2>
      <p class="auth-form-subtitle">We'll send a reset link to your email</p>
    </div>
    <div class="auth-form-body" id="fw-body">
      <div class="form-group">
        <label class="form-label" for="fw-email">Email address</label>
        <input id="fw-email" class="form-input" type="email"
          placeholder="you@example.com" value="${prefillEmail}" autocomplete="email">
      </div>
      <button class="btn btn-primary btn-lg w-full" id="fw-submit">
        <i class="fa-solid fa-paper-plane"></i> Send Reset Link
      </button>
    </div>
  `;

  // Back
  loginForm.querySelector('#fw-back').addEventListener('click',()=>{
    loginForm.innerHTML=origHTML; initAuthUI();
  });

  // Submit
  loginForm.querySelector('#fw-submit').addEventListener('click',async function(){
    const email=loginForm.querySelector('#fw-email')?.value.trim();
    if(!email){_showFwErr(loginForm,'Enter your email address.');return;}
    this.classList.add('btn-loading');this.disabled=true;this.innerHTML='';
    const{success,error}=await resetPassword(email);
    this.classList.remove('btn-loading');this.disabled=false;

    if(success){
      loginForm.innerHTML=`
        <div class="auth-success">
          <div class="auth-success-icon"><i class="fa-solid fa-envelope-circle-check"></i></div>
          <h3>Email sent!</h3>
          <p>Check <strong>${email}</strong> for the reset link. It may take a minute.</p>
          <button class="btn btn-secondary btn-sm" id="fw-back2">
            <i class="fa-solid fa-arrow-left"></i> Back to sign in
          </button>
        </div>`;
      loginForm.querySelector('#fw-back2').addEventListener('click',()=>{ loginForm.innerHTML=origHTML; initAuthUI(); });
    } else {
      this.innerHTML='<i class="fa-solid fa-paper-plane"></i> Send Reset Link';
      _showFwErr(loginForm, error);
    }
  });
}

function _showFwErr(container,msg){
  let el=container.querySelector('.auth-error');
  if(!el){el=document.createElement('div');el.className='auth-error';el.innerHTML='<i class="fa-solid fa-circle-exclamation"></i><span></span>';container.querySelector('#fw-body').prepend(el);}
  el.querySelector('span').textContent=msg;
}

function _strength(pw){
  let s=0;
  if(pw.length>=8)s++;if(/[A-Z]/.test(pw))s++;if(/[0-9]/.test(pw))s++;if(/[^A-Za-z0-9]/.test(pw))s++;
  return s;
}
