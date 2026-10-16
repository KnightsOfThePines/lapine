import { createQuadUI } from './quad-ui.js';
import { createClient } from './vendor/supabase.js';
const $ = s => document.querySelector(s);
const message = text => { if($('#club-status')) $('#club-status').textContent=text; };
const cfg=window.CLUB_CONFIG || {};
let client, session, players=[], history=[], profile=null, organizer=false, records=new Map();
const quadUI=createQuadUI({rpc,players:()=>players,organizer:()=>organizer,message,refresh:()=>refresh()});
function publicKey(key){if(!key||key.startsWith('sb_secret_'))return false;if(key.startsWith('ey')){try{return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{return false;}}return true;}
const configOK=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.supabaseUrl || '') && publicKey(cfg.supabaseKey);
if (!configOK) {
  message('Online accounts are not connected yet. The organizer needs to complete the setup guide.');
  document.querySelectorAll('#main form button[type="submit"]').forEach(b=>b.disabled=true);
} else {
  client=createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.onAuthStateChange((event,next)=>{
    // Never await another Auth call inside this callback (Auth holds its lock).
    if(event==='TOKEN_REFRESHED'){session=next;return;}
    if(event==='SIGNED_OUT' || (event==='SIGNED_IN' && next?.user.id!==session?.user.id)){
      setTimeout(()=>boot().catch(e=>message(e.message)),0);
    }
  });
  boot().catch(e=>message(e.message));
}
async function rpc(name,args={}) { const {data,error}=await client.rpc(name,args); if(error) throw error; return data; }
function rowName(id) { return players.find(p=>p.id===id)?.display_name || 'Player'; }
function element(tag,text,className) { const el=document.createElement(tag); if(text!==undefined) el.textContent=text; if(className) el.className=className; return el; }
async function boot() {
  const {data,error}=await client.auth.getSession(); if(error) throw error; session=data.session;
  organizer=false; profile=null;
  if(session) organizer=await rpc('am_i_admin');
  if($('#account-state')) $('#account-state').textContent=session ? `Signed in as ${session.user.email}` : 'Sign in to manage your profile.';
  if($('#logout')) $('#logout').hidden=!session;
  if($('#login-panel')) $('#login-panel').hidden=!!session;
  if($('#register-panel')) $('#register-panel').hidden=!!session;
  if($('#admin-panel')) $('#admin-panel').hidden=!organizer;
  if($('#admin-denied')) $('#admin-denied').hidden=!session || organizer;
  if($('#profile-panel')) $('#profile-panel').hidden=!session;
  if(session && $('#member-form')) {
    const {data,error}=await client.from('players').select('*').eq('user_id',session.user.id).maybeSingle(); if(error) throw error;
    profile=data;
    $('#profile-panel').hidden=false;
    if(profile) {
      const contact=await rpc('my_contact');
      const f=$('#member-form');
      ['display_name','reported_rating','reported_source','listed','quad_consent'].forEach(key=>{ if(key==='listed'||key==='quad_consent') f.elements[key].checked=profile[key]; else f.elements[key].value=profile[key] ?? ''; });
      ['name','phone','school','interest'].forEach(key=>{ if(contact) f.elements[key].value=contact[key]; });
      const avatar=$('#current-profile-photo'); if(avatar){avatar.replaceChildren();avatar.hidden=!profile.photo;if(profile.photo){const img=element('img');img.src=profile.photo;img.alt='Your saved profile photo';avatar.append(img);}}
      $('#profile-state').textContent=profile.approved ? 'Your membership is approved.' : 'Your membership is waiting for organizer approval.';
    }
    ratingInput();
  }
  await refresh();
  message('');
}
async function refresh() {
  if(!$('#members-grid')&&!$('#admin-panel')&&!$('#quad-public')&&!$('#season-tables')) return;
  const {data,error}=await client.from('players').select('*').order('club_rating',{ascending:false,nullsFirst:false}).order('display_name'); if(error) throw error;
  players=data;
  const recordData=await rpc('player_records'); records=new Map((recordData||[]).map(r=>[r.id,r.record]));
  if($('#members-grid')) {
    const grid=$('#members-grid'); grid.replaceChildren();
    const visible=players.filter(p=>p.approved&&p.active&&p.listed);
    $('#members-status').textContent=visible.length ? `${visible.length} public members · Club Elo` : 'No approved public profiles yet.';
    visible.forEach(p=>{
      const card=element('article',undefined,'member-card'), avatar=element('div','♞','avatar');
      if(p.photo?.startsWith('data:image/jpeg;base64,')) { const img=element('img'); img.src=p.photo; img.alt=''; avatar.replaceChildren(img); }
      card.append(avatar,element('h2',p.display_name),element('p',p.club_rating===null ? 'Club Elo: unrated' : `Club Elo: ${p.club_rating}`),element('p',`${p.games_played} rated games`));
      const record=records.get(p.id);if(record)card.append(element('p',`${record.wins} wins · ${record.draws} draws · ${record.losses} losses`));
      if(p.reported_rating!==null) card.append(element('p',`${p.reported_source}: ${p.reported_rating} (self-reported)`));
      grid.append(card);
    });
  }
  if(organizer && $('#admin-panel')) {
    const {data,error}=await client.from('rating_events').select('*').order('id',{ascending:false}).limit(200); if(error) throw error; history=data;
    fillSelectors(); renderPlayers(); renderHistory(); previewGame(); previewAdjustment();
  }
  await quadUI.load();
}
function fillSelectors() {
  ['player-a','player-b','adjust-player','approve-player','edit-player'].forEach(id=>{
    const select=$('#'+id), previous=select.value; select.replaceChildren(element('option','Choose player'));
    select.options[0].value='';
    players.filter(p=>!['player-a','player-b'].includes(id) || (p.active&&p.approved&&p.club_rating!==null)).forEach(p=>{
      const option=element('option',`${p.display_name} · ${p.club_rating ?? 'unrated'}`); option.value=p.id; select.append(option);
    }); select.value=previous;
  });
}
function renderPlayers() {
  const body=$('#admin-players'); body.replaceChildren();
  players.forEach(p=>{ const row=element('tr'); [p.display_name,p.club_rating ?? 'Unrated',p.games_played,`${records.get(p.id)?.wins??0} / ${records.get(p.id)?.draws??0} / ${records.get(p.id)?.losses??0}`,p.approved?'Approved':'Pending',p.active?'Active':'Inactive',p.listed?'Public':'Private'].forEach(v=>row.append(element('td',String(v)))); body.append(row); });
}
function renderHistory() {
  const body=$('#history'); body.replaceChildren();
  history.forEach(e=>{
    const row=element('tr');
    const result=e.kind==='game' ? `${rowName(e.player_a)} ${e.score===1?'won against':e.score===0?'lost to':'drew with'} ${rowName(e.player_b)}` : `Rating adjustment: ${rowName(e.player_a)}`;
    const ratings=`${e.before_a ?? 'unrated'} → ${e.after_a}`+(e.player_b ? ` / ${e.before_b} → ${e.after_b}`:'');
    [e.id,e.played_on,result,ratings,e.event_name || e.reason,e.voided_at ? `Undone: ${e.void_reason}` : 'Active'].forEach(v=>row.append(element('td',String(v)))); body.append(row);
  });
  const latest=history.find(e=>!e.voided_at); $('#undo-id').value=latest?.id || ''; $('#undo-button').disabled=!latest;
}
function gameValues() {
  const a=players.find(p=>p.id===$('#player-a').value), b=players.find(p=>p.id===$('#player-b').value);
  return {a,b,score:Number($('#score').value)};
}
function previewGame() {
  const {a,b,score}=gameValues();
  if(!a||!b||a.id===b.id) { $('#game-preview').textContent='Choose two different players to preview their rating changes.'; return; }
  const delta=Math.round(32*(score-1/(1+10**((b.club_rating-a.club_rating)/400))));
  $('#game-preview').textContent=`${a.display_name}: ${a.club_rating} → ${a.club_rating+delta}. ${b.display_name}: ${b.club_rating} → ${b.club_rating-delta}. K = 32.`;
}
function previewAdjustment() {
  const p=players.find(p=>p.id===$('#adjust-player').value);
  $('#adjust-preview').textContent=p ? `${p.display_name} currently has ${p.club_rating ?? 'no'} club rating.` : 'Choose a player.';
}
// Keep a request UUID for the same payload if a response is lost and retried.
const requests=new Map();
function requestID(action,args) { const key=action+JSON.stringify(args); if(!requests.has(key)) requests.set(key,crypto.randomUUID()); return {key,id:requests.get(key)}; }
function bindForm(selector,fn) {
  $(selector)?.addEventListener('submit',async e=>{
    e.preventDefault(); const form=e.target; if(!form.reportValidity()) return;
    const button=form.querySelector('button[type="submit"]'); button.disabled=true; message('Saving…');
    try { await fn(form); } catch(error) { message(error.message || 'Unable to save. Please try again.'); } finally { button.disabled=form.id==='undo-form' && !$('#undo-id').value; }
  });
}
bindForm('#login-form',async f=>{
  const {error}=await client.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value}); if(error) throw error;
  f.reset(); await boot(); message('Signed in.');
});
bindForm('#register-form',async f=>{
  const {data,error}=await client.auth.signUp({email:f.elements.email.value.trim(),password:f.elements.password.value,options:{emailRedirectTo:new URL('signup.html',location.href).href,data:{name:f.elements.name.value.trim(),display_name:f.elements.display_name.value.trim()}}}); if(error) throw error;
  f.reset(); if(data.session) { await boot(); message('Account created. Complete your member profile.'); }
  else message('Check your email to confirm your account, then return here and sign in.');
});
$('#logout')?.addEventListener('click',async()=>{ const {error}=await client.auth.signOut(); if(error) message(error.message); else location.reload(); });
$('#reset-password')?.addEventListener('click',async()=>{
  if(!client) return; const email=$('#login-form').elements.email.value.trim();
  if(!email) { message('Enter your email in the sign-in form first.'); return; }
  const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:new URL('reset.html',location.href).href}); message(error ? error.message : 'If the account exists, a password reset email will arrive.');
});
bindForm('#reset-form',async f=>{
  const {data}=await client.auth.getSession(); if(!data.session) throw new Error('Open this page using the link in your password reset email.');
  const {error}=await client.auth.updateUser({password:f.elements.password.value}); if(error) throw error;
  f.reset(); message('Password updated. You can return to the account page.');
});
function ratingInput() { const f=$('#member-form'); if(!f) return; f.elements.reported_rating.disabled=f.elements.reported_source.value==='Unrated'; f.elements.reported_rating.required=!f.elements.reported_rating.disabled; }
$('#member-form select[name="reported_source"]')?.addEventListener('change',ratingInput);
async function photoData(file) {
  if(!file?.size) return null;
  if(file.size>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP smaller than 5 MB.');
  const bitmap=await createImageBitmap(file), size=Math.min(bitmap.width,bitmap.height), canvas=document.createElement('canvas');
  canvas.width=canvas.height=320; canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,320,320); bitmap.close();
  return canvas.toDataURL('image/jpeg',0.85);
}
bindForm('#member-form',async f=>{
  const newPhoto=await photoData(f.elements.photo.files[0]); if(newPhoto&&f.elements.remove_photo.checked) throw new Error('Choose a new photo or removal, not both.');
  const v=f.elements;
  await rpc('save_profile',{p_display_name:v.display_name.value,p_name:v.name.value,p_phone:v.phone.value,p_school:v.school.value,p_interest:v.interest.value,p_listed:v.listed.checked,p_photo:newPhoto || (v.remove_photo.checked ? null : profile?.photo || null),p_reported_rating:v.reported_source.value==='Unrated' ? null : Number(v.reported_rating.value),p_reported_source:v.reported_source.value});
  v.photo.value=''; v.remove_photo.checked=false; await rpc('set_quad_consent',{p_consent:v.quad_consent.checked}); await boot(); message('Profile saved. Club ratings are managed by organizers.');
});
bindForm('#add-form',async f=>{
  await rpc('add_player',{p_name:f.elements.name.value,p_rating:Number(f.elements.rating.value)}); f.reset(); await refresh(); message('Player added privately. Members can opt into the public directory through their own accounts.');
});
bindForm('#approve-form',async f=>{
  await rpc('approve_player',{p_id:f.elements.player.value,p_approved:f.elements.approved.value==='true',p_active:f.elements.active.value==='true'}); await refresh(); message('Membership status updated.');
});
bindForm('#game-form',async f=>{
  const {a,b,score}=gameValues(); if(!a||!b||a.id===b.id) throw new Error('Choose two different players.');
  const args={p_a:a.id,p_b:b.id,p_score:score,p_expected_a:a.club_rating,p_expected_b:b.club_rating,p_event:f.elements.event.value.trim(),p_date:f.elements.date.value};
  const request=requestID('game',args); await rpc('record_game',{p_request_id:request.id,...args}); requests.delete(request.key);
  f.reset(); setDate(); await refresh(); message('Game saved. Both club ratings and game counts updated.');
});
bindForm('#adjust-form',async f=>{
  const p=players.find(p=>p.id===f.elements.player.value); if(!p) throw new Error('Choose a player.');
  const args={p_id:p.id,p_expected:p.club_rating,p_rating:Number(f.elements.rating.value),p_reason:f.elements.reason.value.trim()};
  const request=requestID('adjust',args); await rpc('adjust_rating',{p_request_id:request.id,...args}); requests.delete(request.key);
  f.reset(); await refresh(); message('Rating adjusted. The previous rating and reason are saved in history.');
});
bindForm('#undo-form',async f=>{
  await rpc('undo_latest',{p_id:Number(f.elements.entry.value),p_reason:f.elements.reason.value.trim()}); f.reset(); await refresh(); message('Entry undone. Previous ratings restored; history retained.');
});
['#player-a','#player-b','#score'].forEach(s=>$(s)?.addEventListener('change',previewGame));
$('#adjust-player')?.addEventListener('change',previewAdjustment);
$('#refresh')?.addEventListener('click',()=>refresh().then(()=>message('Latest data loaded.')).catch(e=>message(e.message)));
$('#approve-player')?.addEventListener('change',()=>{const p=players.find(p=>p.id===$('#approve-player').value); if(p) {$('#approve-form').elements.approved.value=String(p.approved); $('#approve-form').elements.active.value=String(p.active);} });
function setDate() { if($('#game-date')) {const d=new Date(); const today=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; $('#game-date').value=today; $('#game-date').max=today;} }
setDate();

$('#edit-player')?.addEventListener('change',()=>{
 const p=players.find(p=>p.id===$('#edit-player').value),f=$('#edit-player-form');if(!p)return;
 f.elements.display_name.value=p.display_name;f.elements.wins.value=p.historical_wins;f.elements.draws.value=p.historical_draws;f.elements.losses.value=p.historical_losses;f.elements.quad_consent.checked=p.quad_consent;
});
bindForm('#edit-player-form',async f=>{await rpc('edit_player',{p_id:f.elements.player.value,p_name:f.elements.display_name.value.trim(),p_wins:Number(f.elements.wins.value),p_draws:Number(f.elements.draws.value),p_losses:Number(f.elements.losses.value),p_quad_consent:f.elements.quad_consent.checked,p_reason:f.elements.reason.value.trim()});await refresh();message('Player details and earlier records saved.');});
// Refresh public views on return and periodically, without interrupting organizer forms.
let refreshing=false;
async function refreshPublic(){if(document.hidden||(!$('#members-grid')&&!$('#quad-public')&&!$('#season-tables'))||!client||refreshing)return;refreshing=true;try{await refresh();}catch(e){message(e.message);}finally{refreshing=false;}}
document.addEventListener('visibilitychange',refreshPublic);
setInterval(refreshPublic,30000);
