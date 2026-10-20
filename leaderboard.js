// Knights of the Pines — public, read-only leaderboard.
// Uses the existing CLUB_CONFIG and player_records() function; never writes data.
const root = document.getElementById('club-leaderboard');
if (root) startLeaderboard(root);

function startLeaderboard(root) {
  root.classList.add('club-lb');
  root.setAttribute('aria-labelledby', 'lb-title');
  root.innerHTML = `
    <div class="lb-heading"><div><p class="eyebrow">Club competition</p><h2 id="lb-title">The leaderboard.</h2><p>Climb the ranks. Find your next challenge.</p></div><button type="button" class="lb-refresh">Refresh standings</button></div>
    <div class="lb-summary" aria-label="Leaderboard summary"></div>
    <div class="lb-controls"><label for="lb-search">Find a player<input id="lb-search" type="search" placeholder="Search by display name" maxlength="80"></label><label for="lb-minimum">Recorded games<select id="lb-minimum"><option value="0">All players</option><option value="5">5 or more</option><option value="10">10 or more</option><option value="20">20 or more</option></select></label></div>
    <p class="lb-status" role="status" aria-live="polite">Loading standings…</p>
    <div class="lb-table-wrap" role="region" aria-label="Club standings, scroll horizontally for more columns" tabindex="0"><table><caption>All-time club standings, ranked by club Elo.</caption><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Club Elo</th><th scope="col">Games</th><th scope="col">Wins</th><th scope="col">Draws</th><th scope="col">Losses</th><th scope="col">Score %</th></tr></thead><tbody></tbody></table></div>
    <nav class="lb-pagination" aria-label="Leaderboard pages"><button type="button" class="lb-previous" disabled>Previous</button><span class="lb-page"></span><button type="button" class="lb-next" disabled>Next</button></nav>
    <p class="lb-note">Equal Elo means equal rank (1, 1, 3). Unrated players appear after rated players. “Provisional” means fewer than 5 recorded games; it does not change ranking. Games and W/D/L include saved historical records, rated games, and completed unrated quad games. Score % = (wins + half of draws) ÷ games. Only approved, active members who opted into the public directory appear.</p>
    <noscript>Enable JavaScript to load the live leaderboard.</noscript>`;
  const $ = selector => root.querySelector(selector);
  const body = $('tbody'), status = $('.lb-status');
  let players = [], page = 1, loaded = false, busy = false, recordsAvailable = false, lastUpdated = '';
  const pageSize = 10;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const validRecord = record => record && ['wins', 'draws', 'losses'].every(key => Number.isSafeInteger(record[key]) && record[key] >= 0);
  const gameCount = player => player.record ? player.record.wins + player.record.draws + player.record.losses : null;
  function render() {
    const minimum = Number($('#lb-minimum').value);
    // Assign ranks before searching or pagination so a search never changes a player's rank.
    let previousRating, rank = 0;
    const ranked = players.map((player, index) => {
      if (player.club_rating !== null && player.club_rating !== previousRating) rank = index + 1;
      previousRating = player.club_rating;
      return { ...player, rank: player.club_rating === null ? null : rank };
    });
    const query = $('#lb-search').value.trim().toLocaleLowerCase();
    const matches = ranked.filter(p => p.display_name.toLocaleLowerCase().includes(query) && (minimum === 0 || (gameCount(p) ?? -1) >= minimum));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages);
    body.replaceChildren();
    for (const player of matches.slice((page - 1) * pageSize, page * pageSize)) {
      const row = el('tr');
      if (player.rank !== null && player.rank <= 3) row.className = 'lb-top';
      const place = el('td'); place.append(el('span', player.rank === null ? '—' : `#${player.rank}`, 'lb-rank'));
      const nameCell = el('th'); nameCell.scope = 'row';
      const identity = el('div', undefined, 'lb-identity'), avatar = el('span', '♞', 'lb-avatar');
      avatar.setAttribute('aria-hidden', 'true');
      // Existing profile photos are locally resized JPEG data URLs, not arbitrary remote URLs.
      if (typeof player.photo === 'string' && player.photo.startsWith('data:image/jpeg;base64,')) {
        const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.width = img.height = 40;
        img.addEventListener('error', () => avatar.replaceChildren(document.createTextNode('♞')));
        img.src = player.photo; avatar.replaceChildren(img);
      }
      const name = el('div'); name.append(el('span', player.display_name));
      const total = gameCount(player);
      if (player.club_rating === null) name.append(el('small', 'Unrated', 'lb-badge'));
      else if (total !== null && total < 5) name.append(el('small', 'Provisional', 'lb-badge'));
      identity.append(avatar, name); nameCell.append(identity);
      const record = player.record;
      const percentage = total > 0 ? `${((record.wins + record.draws / 2) / total * 100).toFixed(1)}%` : '—';
      row.append(place, nameCell, el('td', player.club_rating === null ? 'Unrated' : String(player.club_rating), 'lb-elo'), ...[total, record?.wins, record?.draws, record?.losses, percentage].map(value => el('td', value == null ? '—' : String(value))));
      body.append(row);
    }
    if (!matches.length) {
      const cell = el('td', players.length ? 'No players match your search or game filter.' : 'No approved public players yet. Join the club and opt into the public directory.');
      cell.colSpan = 8; cell.className = 'lb-empty'; const row = el('tr'); row.append(cell); body.append(row);
    }
    $('.lb-page').textContent = `Page ${page} of ${pages}`;
    $('.lb-previous').disabled = page === 1;
    $('.lb-next').disabled = page === pages;
    const summary = $('.lb-summary'); summary.replaceChildren();
    const rated = players.filter(p => p.club_rating !== null);
    for (const [label, value] of [['Public players', players.length], ['Rated contenders', rated.length], ['Leading Elo', rated[0]?.club_rating ?? '—']]) {
      const item = el('div'); item.append(el('strong', String(value)), el('span', label)); summary.append(item);
    }
    status.textContent = `${matches.length} player${matches.length === 1 ? '' : 's'}${query || minimum ? ' matching filters' : ''} · Updated ${lastUpdated}.` + (!recordsAvailable ? ' Game records unavailable; Elo standings still work. Dashes mean unavailable, not zero.' : '');
  }
  function getConfig() {
    const config = window.CLUB_CONFIG || {};
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl || '')) throw new Error('Check the existing Supabase project URL in config.js.');
    const key = config.supabaseKey || '';
    let allowed = key.startsWith('sb_publishable_');
    if (key.startsWith('ey')) {
      try { allowed = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { allowed = false; }
    }
    if (!allowed) throw new Error('config.js needs your publishable or legacy anon key. Never use an admin or secret key.');
    return { url: config.supabaseUrl.replace(/\/$/, ''), key };
  }
  async function request(config, path, options = {}) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${config.url}/rest/v1/${path}`, { ...options, headers: { apikey: config.key, ...(config.key.startsWith('ey') ? { Authorization: `Bearer ${config.key}` } : {}), 'Content-Type': 'application/json', ...options.headers }, signal: controller.signal });
      if (!response.ok) throw new Error(`Database request failed (${response.status}).`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function load() {
    if (busy) return;
    busy = true; $('.lb-refresh').disabled = true; root.setAttribute('aria-busy', 'true');
    if (!loaded) status.textContent = 'Loading standings…';
    try {
      const config = getConfig(), fetched = [];
      // Explicit public filters also apply when the visitor is the organizer.
      for (let offset = 0; ; offset += 500) {
        const batch = await request(config, `players?select=id,display_name,club_rating,photo&approved=eq.true&active=eq.true&listed=eq.true&order=id.asc&offset=${offset}&limit=500`);
        if (!Array.isArray(batch)) throw new Error('Unexpected player data.');
        fetched.push(...batch); if (batch.length < 500) break;
      }
      let records = new Map(); recordsAvailable = false;
      try {
        const data = await request(config, 'rpc/player_records', { method: 'POST', body: '{}' });
        if (!Array.isArray(data)) throw new Error('Unexpected records.');
        records = new Map(data.filter(r => validRecord(r.record)).map(r => [r.id, r.record]));
        recordsAvailable = fetched.every(p => records.has(p.id));
      } catch { /* Older schema/network error: show Elo without inventing records. */ }
      players = fetched.map(p => ({ ...p, display_name: String(p.display_name || 'Player'), club_rating: Number.isInteger(p.club_rating) ? p.club_rating : null, record: records.get(p.id) ?? null })).sort((a, b) => (a.club_rating === null) - (b.club_rating === null) || (b.club_rating ?? 0) - (a.club_rating ?? 0) || a.display_name.localeCompare(b.display_name) || String(a.id).localeCompare(String(b.id)));
      if (!recordsAvailable) $('#lb-minimum').value = '0';
      $('#lb-minimum').disabled = !recordsAvailable;
      loaded = true; lastUpdated = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); render();
    } catch (error) {
      status.textContent = `${loaded ? 'Showing previously loaded standings. ' : 'Standings could not load. '}${error.name === 'AbortError' ? 'The connection timed out.' : error.message} Use Refresh standings to try again.`;
    } finally { busy = false; $('.lb-refresh').disabled = false; root.removeAttribute('aria-busy'); }
  }
  $('#lb-search').addEventListener('input', () => { page = 1; if (loaded) render(); });
  $('#lb-minimum').addEventListener('change', () => { page = 1; if (loaded) render(); });
  $('.lb-previous').addEventListener('click', () => { page--; render(); });
  $('.lb-next').addEventListener('click', () => { page++; render(); });
  $('.lb-refresh').addEventListener('click', load);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 60000);
  load();
}
