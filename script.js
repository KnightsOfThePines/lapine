document.documentElement.classList.add('js');
const $ = selector => document.querySelector(selector);
const menu = $('.menu-toggle'), nav = $('#nav-links');
function closeMenu() { nav?.classList.remove('is-open'); menu?.setAttribute('aria-expanded','false'); }
menu?.addEventListener('click', () => menu.setAttribute('aria-expanded',String(nav.classList.toggle('is-open'))));
nav?.addEventListener('click', e => { if(e.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', e => { if(e.key==='Escape' && nav?.classList.contains('is-open')) { closeMenu(); menu.focus(); } });
if ($('#year')) $('#year').textContent = new Date().getFullYear();
const page = location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a').forEach(a => { if(a.getAttribute('href')===page) a.setAttribute('aria-current','page'); });
const hero = $('.hero-image');
function fallback() { hero.hidden=true; $('.photo-placeholder').hidden=false; }
if(hero) { hero.addEventListener('error',fallback); if(hero.complete&&!hero.naturalWidth) fallback(); }
$('#elo-form')?.addEventListener('submit', e => {
  e.preventDefault(); const f=new FormData(e.target), old=Number(f.get('player'));
  const expected=1/(1+10**((Number(f.get('opponent'))-old)/400)), change=Math.round(32*(Number(f.get('score'))-expected));
  $('#elo-result').textContent=`Expected score: ${(expected*100).toFixed(1)}%. Change: ${change>=0?'+':''}${change}. New club rating: ${old+change}. This preview does not save a result.`;
});
