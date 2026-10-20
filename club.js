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
// === Announcements & Events: append this block ONCE at the end of club.js ===
// Reuses this file's existing Supabase client and auth session.
(() => {
  const home = !!document.querySelector('#main .hero');
  const adminHost = document.getElementById('admin-panel');
  if ((!home && !adminHost) || !client) return;
  const fields = ['kind','category','title','body','event_day','starts_at','ends_at','venue','address','registration_deadline','link_url','pinned','cancelled','published','visible_until'];
  let posts = [], admin = false, loading = false, reloadAfter = false, editingID = crypto.randomUUID(), revision = 0;
  let editor, form, list, notice, preview, feed, alerts, lastPublic = [], calendar;
  const make = (tag, text, cls) => { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; if(cls)n.className=cls; return n; };
  const today = () => {
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  const current = p => p.published && (!p.visible_until || p.visible_until>=today()) && (p.kind!=='event'||p.event_day>=today());
  const date = iso => iso ? new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(new Date(iso+'T12:00:00Z')) : '';
  const time = value => {if(!value)return '';const [h,m]=value.split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'a.m.':'p.m.'}`;};
  function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:null;}catch{return null;}}
  function addLink(parent,url,label){const href=safeURL(url);if(!href)return;const a=make('a',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}
  function card(p){
    const a=make('article',undefined,'cn-card');a.dataset.clubPost=p.id||'preview';
    a.append(make('p',p.cancelled?'Cancelled':p.kind==='closure'?'Schedule change':p.kind==='event'?({club:'Club night',quad:'Quads',tournament:'Tournament',other:'Event'}[p.category]||'Event'):'Club announcement','cn-label'));
    a.append(make('h3',p.title||'Your post title'));
    if(p.kind==='event'&&p.event_day){const t=make('time',`${date(p.event_day)} · ${time(p.starts_at)}–${time(p.ends_at)} Pacific`);t.dateTime=p.event_day;a.append(t);}
    if(p.cancelled)a.append(make('p','This event is cancelled.','cn-cancelled'));
    if(p.body)a.append(make('p',p.body,'cn-body'));
    if(p.venue||p.address)a.append(make('p',[p.venue,p.address].filter(Boolean).join(' · '),'cn-meta'));
    if(p.registration_deadline)a.append(make('p',`${p.registration_deadline<today()?'Registration deadline passed':'Register by'}: ${date(p.registration_deadline)}`,'cn-meta'));
    if(p.address)addLink(a,'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(p.address),'Get directions ↗');
    if(p.link_url&&!p.cancelled)addLink(a,p.link_url,'More information ↗');
    return a;
  }
  function publicContainers(){
    if(!home)return;
    const main=document.getElementById('main');
    if(!alerts){alerts=make('section',undefined,'cn-alerts');alerts.setAttribute('aria-label','Important club notices');alerts.hidden=true;main.prepend(alerts);}
    if(!feed){feed=make('section',undefined,'section cn-feed');feed.id='club-updates';feed.setAttribute('aria-label','Club updates');feed.hidden=true;}
    const anchor=main.querySelector('[data-club-meeting]')||main.querySelector('.hero');
    if(anchor&&anchor.nextElementSibling!==feed)anchor.after(feed);
  }
  function syncCalendar(){
    if(!calendar)return;
    const dateEl=document.getElementById('ch-next-date');
    for(const node of [...calendar.children].filter(n=>!n.dataset.clubPost)){
      const label=node.querySelector('.ch-event-tag')?.textContent.trim().toLowerCase();
      if(node.contains(dateEl))node.hidden=lastPublic.some(p=>p.kind==='event'&&p.category==='club'&&p.event_day===dateEl?.getAttribute('datetime'));
      else if(label==='quads & competition')node.hidden=lastPublic.some(p=>p.kind==='event'&&p.category==='quad');
      else if(label==='tournaments')node.hidden=lastPublic.some(p=>p.kind==='event'&&p.category==='tournament');
    }
  }
  function renderPublic(){
    if(!home)return;publicContainers();
    lastPublic=posts.filter(current);
    const urgent=lastPublic.filter(p=>p.kind==='closure'||p.pinned||p.cancelled);
    alerts.replaceChildren();alerts.hidden=!urgent.length;
    if(urgent.length){const box=make('div');for(const p of urgent){const a=make('article');a.append(make('h2',(p.cancelled?'Cancelled: ':'')+p.title));if(p.event_day)a.append(make('p',date(p.event_day)+' · '+time(p.starts_at)+' Pacific'));if(p.body)a.append(make('p',p.body));if(p.link_url)addLink(a,p.link_url,'Read more ↗');box.append(a);}alerts.append(box);}
    const notices=lastPublic.filter(p=>p.kind==='announcement'&&!p.pinned);
    const events=lastPublic.filter(p=>p.kind==='event').sort((a,b)=>a.event_day.localeCompare(b.event_day)||a.starts_at.localeCompare(b.starts_at));
    feed.replaceChildren();
    if(notices.length){feed.append(make('p','From the club','eyebrow'),make('h2','Club updates.'));const grid=make('div',undefined,'cn-news-grid');notices.forEach(p=>grid.append(card(p)));feed.append(grid);}
    calendar=document.querySelector('#upcoming-events .ch-event-grid');
    if(calendar){calendar.querySelectorAll('[data-club-post]').forEach(n=>n.remove());const nextDate=document.getElementById('ch-next-date');const placeholder=[...calendar.children].find(n=>!n.dataset.clubPost&&!n.contains(nextDate));events.forEach(p=>calendar.insertBefore(card(p),placeholder||null));syncCalendar();}
    else if(events.length){feed.append(make('h2','Upcoming events.'));const grid=make('div',undefined,'cn-news-grid');events.forEach(p=>grid.append(card(p)));feed.append(grid);}
    feed.hidden=!feed.children.length;
  }
  function payload(){
    const v=form.elements, p={};
    for(const key of fields)p[key]=['pinned','cancelled','published'].includes(key)?v[key].checked:v[key].value.trim();
    if(p.kind!=='event')for(const key of ['event_day','starts_at','ends_at','registration_deadline'])p[key]='';
    if(p.kind!=='event'){p.cancelled=false;p.category='other';}
    return p;
  }
  function setNotice(text){notice.textContent=text;}
  function updateForm(){
    const isEvent=form.elements.kind.value==='event',closure=form.elements.kind.value==='closure';
    form.querySelector('.cn-event-fields').hidden=!isEvent;
    for(const key of ['event_day','starts_at','ends_at'])form.elements[key].required=isEvent;
    form.elements.visible_until.required=closure;
    form.querySelector('[data-expiry-help]').textContent=closure?'Required for schedule changes so an old closure notice does not stay up indefinitely.':'Optional: last date to display this post, inclusive (Pacific Time).';
    form.querySelector('[type=submit]').textContent=form.elements.published.checked?'Publish changes':'Save draft / hidden post';
    preview.replaceChildren(card(payload()));
  }
  function edit(p){
    editingID=p?.id||crypto.randomUUID();revision=p?.revision||0;
    form.reset();form.dataset.dirty='false';
    for(const key of fields){const input=form.elements[key];if(['pinned','cancelled','published'].includes(key))input.checked=!!p?.[key];else input.value=p?.[key]??(key==='kind'?'announcement':key==='category'?'other':'');}
    form.querySelector('[data-edit-label]').textContent=p?`Editing: ${p.title}`:'New announcement or event';
    updateForm();
  }
  function renderList(){
    list.replaceChildren();if(!posts.length){list.append(make('p','No posts yet. Save a draft to get started.'));return;}
    for(const p of posts){
      const box=make('article',undefined,'cn-list-item');box.append(make('h3',p.title));
      const visibility=!p.published?'Draft / hidden':current(p)?'Published':'Published · past event or expired';
      box.append(make('p',`${visibility} · ${p.kind}${p.cancelled?' · cancelled':''} · revision ${p.revision}`));
      const editButton=make('button','Edit','button secondary');editButton.type='button';editButton.addEventListener('click',()=>{if(form.dataset.dirty==='true'&&!confirm('Discard unsaved changes and open this saved post?'))return;edit(p);editor.open=true;form.scrollIntoView({block:'start'});});
      const toggle=make('button',p.published?'Hide from website':'Publish','button');toggle.type='button';
      toggle.addEventListener('click',async()=>{toggle.disabled=true;try{await rpc('save_club_post',{p_id:p.id,p_expected_revision:p.revision,p_payload:{...p,published:!p.published}});await load();setNotice(p.published?'Post hidden from the website.':'Post marked published. Expired posts and past events remain hidden.');if(editingID===p.id&&form.dataset.dirty!=='true'){const latest=posts.find(x=>x.id===p.id);if(latest)edit(latest);}}catch(e){setNotice(e.message+' Reload the list before trying again.');}finally{toggle.disabled=false;}});
      box.append(editButton,toggle);list.append(box);
    }
  }
  function buildEditor(){
    if(editor)return;
    editor=make('details',undefined,'form-panel cn-editor');editor.id='announcements-admin';
    editor.innerHTML=`<summary>Announcements &amp; Events</summary><p>Create drafts, publish club news, or post schedule changes. Published content is public. Dates and times are Pacific Time.</p><p class="cn-notice" role="status" aria-live="polite"></p><div class="actions"><button type="button" class="button secondary" data-new>New post</button><button type="button" class="button secondary" data-reload>Reload list</button><a href="index.html#club-updates" target="_blank" rel="noopener noreferrer">View homepage ↗</a></div><form><h3 data-edit-label>New announcement or event</h3><fieldset class="cn-post-fields"><div class="form-grid"><label>Post type<select name="kind"><option value="announcement">Announcement</option><option value="event">Event</option><option value="closure">Important schedule change</option></select></label><label>Display until<input type="date" name="visible_until"><span class="hint" data-expiry-help></span></label></div><label>Title<input name="title" maxlength="120" required></label><label>Details<textarea name="body" maxlength="4000" rows="5"></textarea></label><div class="cn-event-fields" hidden><div class="form-grid"><label>Event category<select name="category"><option value="club">Club night</option><option value="quad">Quads</option><option value="tournament">Tournament</option><option value="other" selected>Other event</option></select></label><label>Event date<input name="event_day" type="date"></label><label>Start time (Pacific)<input name="starts_at" type="time"></label><label>End time (Pacific)<input name="ends_at" type="time"></label><label>Registration deadline (optional)<input name="registration_deadline" type="date"></label></div><label class="check"><input name="cancelled" type="checkbox"><span>This event is cancelled — show a cancellation notice</span></label></div><div class="form-grid"><label>Venue (optional)<input name="venue" maxlength="200" placeholder="Legend Cider"></label><label>Address (optional)<input name="address" maxlength="400" placeholder="16481 Bluewood Place, La Pine, OR 97739"></label></div><label>Information / registration URL (optional)<input name="link_url" type="url" maxlength="1000" pattern="https://.*" placeholder="https://…"><span class="hint">Use a full HTTPS URL. Adding a link does not create an event registration system.</span></label><label class="check"><input name="pinned" type="checkbox"><span>Pin prominently at the top of the homepage</span></label><label class="check"><input name="published" type="checkbox"><span>Publish on the website (leave unchecked to save a private draft)</span></label><p class="cn-help">Events end the same day they start. Past events and expired posts disappear automatically. Schedule-change posts require an expiry date. No posts are permanently deleted; hide a post to remove it from public view.</p><h3>Preview</h3><div class="cn-preview"></div><button class="button" type="submit">Save draft / hidden post</button></fieldset></form><h3>Saved posts</h3><p class="hint">Latest 200 posts. Reloading the list does not replace an unsaved form; use Edit to open a saved version.</p><div class="cn-post-list"></div>`;
    adminHost.prepend(editor);
    form=editor.querySelector('form');list=editor.querySelector('.cn-post-list');notice=editor.querySelector('.cn-notice');preview=editor.querySelector('.cn-preview');
    form.addEventListener('input',updateForm);form.addEventListener('change',updateForm);
    editor.querySelector('[data-new]').addEventListener('click',()=>{if(form.dataset.dirty==='true'&&!confirm('Discard your unsaved changes and start a new post?'))return;form.dataset.dirty='false';edit(null);setNotice('');});
    form.addEventListener('input',()=>{form.dataset.dirty='true';});form.addEventListener('change',()=>{form.dataset.dirty='true';});
    editor.querySelector('[data-reload]').addEventListener('click',()=>load());
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(!form.reportValidity())return;
      const p=payload();
      if(p.kind==='event'&&p.ends_at<=p.starts_at){setNotice('End time must be after start time on the same day.');return;}
      if(p.kind==='event'&&p.registration_deadline&&p.registration_deadline>p.event_day){setNotice('Registration deadline must be on or before the event date.');return;}
      if(p.link_url&&!safeURL(p.link_url)){setNotice('Use an HTTPS URL.');return;}
      const fieldset=form.querySelector('fieldset');fieldset.disabled=true;setNotice('Saving…');
      try{
        const data=await rpc('save_club_post',{p_id:editingID,p_expected_revision:revision,p_payload:p});
        const saved=Array.isArray(data)?data[0]:data;
        if(!saved?.id)throw new Error('Save response was incomplete. Reload the list to check whether the post saved.');
        form.dataset.dirty='false';edit(saved);await load();
        setNotice(saved.published?(current(saved)?'Published. The homepage will refresh within a minute or when reloaded.':'Saved as published, but hidden because the event is past or the display date has expired.'):'Draft / hidden post saved. Visitors cannot see it.');
      }catch(e){setNotice(e.message+' Your form is kept. Reload the list and check for a saved post before retrying.');}
      finally{fieldset.disabled=false;}
    });
    edit(null);
  }
  async function load(){
    if(loading){reloadAfter=true;return;}loading=true;
    try{
      const {data,error}=await client.auth.getSession();if(error)throw error;
      admin=!!data.session&&await rpc('am_i_admin');
      if(adminHost&&admin)buildEditor();if(editor)editor.hidden=!admin;
      let query=client.from('club_posts').select('id,kind,category,title,body,event_day,starts_at,ends_at,venue,address,registration_deadline,link_url,pinned,cancelled,published,visible_until,revision,updated_at').order('updated_at',{ascending:false}).limit(200);
      if(home)query=query.eq('published',true);
      const result=await query;if(result.error)throw result.error;
      posts=result.data||[];
      if(admin&&list)renderList();if(home)renderPublic();
    }catch(e){
      if(editor&&admin)setNotice('Club updates could not load. Run ANNOUNCEMENTS-SETUP.sql once if you have not already. '+e.message);
      if(home){publicContainers();let errorNode=feed.querySelector('.cn-news-status');if(!errorNode){errorNode=make('p',undefined,'cn-news-status');feed.append(errorNode);}errorNode.textContent='Club updates are temporarily unavailable. Check Discord for schedule changes.';feed.hidden=false;}
    }finally{loading=false;if(reloadAfter){reloadAfter=false;setTimeout(load,0);}}
  }
  // Auth callbacks never await other auth calls while Supabase's auth lock is held.
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_IN'||event==='SIGNED_OUT'){if(editor&&event==='SIGNED_OUT')editor.hidden=true;setTimeout(load,0);}});
  setTimeout(load,0);
  if(home){
    setInterval(()=>{if(!document.hidden)load();},60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
    // homepage-info.js may build its calendar before or after this module loads.
    const watchDate=()=>{const n=document.getElementById('ch-next-date');if(n)new MutationObserver(syncCalendar).observe(n,{attributes:true,attributeFilter:['datetime'],childList:true,subtree:true});};
    if(document.querySelector('#upcoming-events .ch-event-grid'))watchDate();
    else{const observer=new MutationObserver(()=>{if(document.querySelector('#upcoming-events .ch-event-grid')){observer.disconnect();watchDate();renderPublic();}});observer.observe(document.getElementById('main'),{childList:true,subtree:true});}
  }
})();
// === End Announcements & Events ===

async function refreshPublic(){if(document.hidden||(!$('#members-grid')&&!$('#quad-public')&&!$('#season-tables'))||!client||refreshing)return;refreshing=true;try{await refresh();}catch(e){message(e.message);}finally{refreshing=false;}}
document.addEventListener('visibilitychange',refreshPublic);
setInterval(refreshPublic,30000);
