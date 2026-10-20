// Knights of the Pines: meeting details, first visit and upcoming events.
// No database changes. Existing navigation, signup and Discord links stay in place.
const CLUB = {
  venue: 'Legend Cider',
  address: '16481 Bluewood Place, La Pine, OR 97739',
  firstMeeting: '2026-10-27',
  timeZone: 'America/Los_Angeles',
};

export function nextClubNight(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const calendar = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  let days = (2 - calendar.getUTCDay() + 7) % 7;
  if (days === 0 && Number(parts.hour) >= 20) days = 7;
  calendar.setUTCDate(calendar.getUTCDate() + days);
  const date = [CLUB.firstMeeting, calendar.toISOString().slice(0, 10)].sort().at(-1);
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));
  return { date, formatted, today: date === today, underway: date === today && Number(parts.hour) >= 17 && Number(parts.hour) < 20 };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
function mount() {
  const main = document.getElementById('main');
  if (!main || main.querySelector('[data-club-meeting]')) return;
  const directionURL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(CLUB.address)}`;
  const strip = document.createElement('section');
  strip.className = 'club-home ch-meeting'; strip.dataset.clubMeeting = ''; strip.setAttribute('aria-label', 'Weekly chess club meeting');
  strip.innerHTML = `<div class="ch-meeting-inner"><div><span class="ch-kicker">Your Tuesday move</span><h2>Chess at Legend Cider.</h2><p><strong>Every Tuesday · 5–8 p.m.</strong></p><p>Starting October 27, 2026 · La Pine, Oregon</p></div><div class="ch-location"><p><strong>Legend Cider</strong><br>16481 Bluewood Place<br>La Pine, OR 97739</p><a class="ch-directions" target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a></div><div class="ch-welcome"><span class="ch-pill">Free to attend</span><p>All ages. All skill levels.</p><a href="#join">Plan your first visit <span aria-hidden="true">↓</span></a></div></div>`;
  strip.querySelector('.ch-directions').href = directionURL;
  const hero = main.querySelector('.hero');
  if (hero) hero.after(strip); else main.prepend(strip);

  const visit = document.createElement('section');
  visit.id = 'join'; visit.className = 'club-home section ch-visit'; visit.setAttribute('aria-labelledby', 'ch-visit-title');
  visit.innerHTML = `<div class="ch-visit-intro"><p class="eyebrow">Your first visit</p><h2 id="ch-visit-title">A seat at the board.</h2><p>New to chess? Coming back after a break? Looking for a challenging game? You’re welcome here.</p><a class="button" href="signup.html">Join the club</a></div><div class="ch-answers"><div><h3>Free to play</h3><p>Attending the club costs nothing. Food and drinks are available to purchase separately.</p></div><div><h3>All ages welcome</h3><p>Beginners and experienced players are welcome. You don’t need a rating to get started.</p></div><div><h3>Boards provided</h3><p>We offer basic boards for club play. You’re welcome to bring your own board if you prefer.</p></div><div><h3>Find us on Tuesdays</h3><p>Meet us at Legend Cider in La Pine from 5–8 p.m., beginning October 27, 2026.</p></div></div>`;
  const oldVisit = main.querySelector('#join');
  if (oldVisit) oldVisit.replaceWith(visit); else main.append(visit);

  const events = document.createElement('section');
  events.id = 'upcoming-events'; events.className = 'club-home section ch-events'; events.setAttribute('aria-labelledby', 'ch-events-title');
  events.innerHTML = `<div class="ch-events-heading"><p class="eyebrow">On the calendar</p><h2 id="ch-events-title">Your next game starts here.</h2><p>Weekly chess, friendly competition, and more to come.</p></div><div class="ch-event-grid"><article class="ch-event ch-event-featured"><p class="ch-event-tag" id="ch-night-tag">Next club night</p><h3 id="ch-night-title">Tuesday chess night</h3><time id="ch-next-date" datetime="2026-10-27">Tuesday, October 27, 2026</time><p><strong>5–8 p.m. · Legend Cider</strong></p><p>Free chess for all ages and experience levels. Basic boards provided.</p><a class="ch-event-directions" target="_blank" rel="noopener noreferrer">Get directions <span aria-hidden="true">↗</span></a></article><article class="ch-event"><p class="ch-event-tag">Quads &amp; competition</p><h3>Enter the next quads.</h3><p class="ch-event-pending">Dates to be announced</p><p>Quad registration dates and deadlines will be posted once confirmed.</p><a href="quads.html">Explore quads <span aria-hidden="true">→</span></a></article><article class="ch-event"><p class="ch-event-tag">Tournaments</p><h3>Something to play for.</h3><p class="ch-event-pending">Dates to be announced</p><p>Watch this space for upcoming tournaments and entry details.</p><a href="signup.html">Create a club profile <span aria-hidden="true">→</span></a></article></div><p class="ch-calendar-note">Club times are in Pacific Time. Check club announcements for holiday closures or schedule changes.</p>`;
  events.querySelector('.ch-event-directions').href = directionURL;
  visit.after(events);
  const dateEl = events.querySelector('#ch-next-date');
  function updateNight() {
    const next = nextClubNight();
    if (dateEl.dateTime !== next.date || dateEl.textContent !== next.formatted) {
      dateEl.dateTime = next.date; dateEl.textContent = next.formatted;
    }
    events.querySelector('#ch-night-tag').textContent = next.underway ? 'Happening now' : next.today ? 'Today at the club' : 'Next club night';
    events.querySelector('#ch-night-title').textContent = next.date === CLUB.firstMeeting ? 'Opening night.' : 'Tuesday chess night.';
  }
  updateNight();
  setInterval(() => { if (!document.hidden) updateNight(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) updateNight(); });
}
