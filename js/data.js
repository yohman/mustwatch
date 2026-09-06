window.EPLData = (() => {
  const LEAGUES = {
    epl: { id: 'epl', slug: 'eng.1', name: 'Premier League', shortName: 'PREMIER LEAGUE', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/eng.1.png' },
    laliga: { id: 'laliga', slug: 'esp.1', name: 'La Liga', shortName: 'LA LIGA', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/esp.1.png' }
  };
  let activeLeague = 'epl';
  const base = slug => `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}`;
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const color = team => team?.color ? `#${team.color}` : '#77736a';
  const isLiveStatus = status => { const type = status?.type || status || {}, name = String(type.name || status?.name || ''); return type.state === 'in' || status?.state === 'in' || /^STATUS_(?:FIRST|SECOND|HALF|EXTRA|IN_PROGRESS)/.test(name); };
  function dateRange() { const now = new Date(), format = date => date.toISOString().slice(0, 10).replaceAll('-', ''), start = new Date(now), end = new Date(now); start.setDate(now.getDate() - 50); end.setDate(now.getDate() + 80); return `${format(start)}-${format(end)}`; }
  function normalize(event, league = LEAGUES[activeLeague]) {
    const competition = event.competitions?.[0], teams = competition?.competitors || [], home = teams.find(team => team.homeAway === 'home'), away = teams.find(team => team.homeAway === 'away');
    if (!home || !away) return null;
    const completed = event.status?.type?.completed === true, live = isLiveStatus(event.status), scored = completed || live;
    return { id: event.id, leagueId: league.id, league: league.name, leagueLogo: league.logo, time: new Date(event.date), home: clean(home.team.displayName), away: clean(away.team.displayName), homeId: String(home.team.id || ''), awayId: String(away.team.id || ''), homeAbbr: home.team.abbreviation, awayAbbr: away.team.abbreviation, homeLogo: home.team.logo || home.team.logos?.[0]?.href || '', awayLogo: away.team.logo || away.team.logos?.[0]?.href || '', homeColor: color(home.team), awayColor: color(away.team), homeScore: scored ? Number(home.score) : null, awayScore: scored ? Number(away.score) : null, completed, live, venue: clean(competition.venue?.fullName), status: event.status?.type?.detail || '', events: [], raw: event };
  }
  async function load(id = activeLeague) {
    const league = LEAGUES[id]; if (!league) throw Error('Unknown league.'); activeLeague = id;
    const [fixtures, standings] = await Promise.all([fetch(`${base(league.slug)}/scoreboard?limit=1000&dates=${dateRange()}`), fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${league.slug}/standings`).catch(() => null)]);
    if (!fixtures.ok) throw Error(`${league.name} fixtures are unavailable (${fixtures.status}).`);
    const games = ((await fixtures.json()).events || []).map(event => normalize(event, league)).filter(Boolean);
    if (!games.length) throw Error(`The ${league.name} feed returned no fixtures for this period.`);
    const ranks = {}; try { const table = standings?.ok ? await standings.json() : null; (table?.children || []).flatMap(group => group.standings?.entries || []).forEach(entry => { const rank = entry.stats?.find(stat => stat.name === 'rank')?.value; if (Number.isFinite(rank)) ranks[clean(entry.team?.displayName)] = rank; }); } catch (_) {}
    games.forEach(game => { const home = ranks[game.home], away = ranks[game.away]; if (!Number.isFinite(home) || !Number.isFinite(away)) return; game.homeRank = home; game.awayRank = away; const competitiveness = 100 - Math.min(70, Math.abs(home - away) * 7), stakes = home <= 6 && away <= 6 ? 20 : home >= 15 && away >= 15 ? 12 : 0; game.contextScore = Math.round(Math.min(100, competitiveness + stakes)); });
    return games;
  }
  async function refresh(games) {
    const groups = [...new Set(games.map(game => game.leagueId || activeLeague))];
    await Promise.all(groups.map(async id => { const league = LEAGUES[id]; try { const response = await fetch(`${base(league.slug)}/scoreboard?limit=1000&dates=${dateRange()}`); if (!response.ok) return; const fresh = new Map(((await response.json()).events || []).map(event => normalize(event, league)).filter(Boolean).map(game => [String(game.id), game])); games.filter(game => game.leagueId === id).forEach(game => { const update = fresh.get(String(game.id)); if (update) Object.assign(game, { live: update.live, completed: update.completed, status: update.status, homeScore: update.homeScore, awayScore: update.awayScore }); }); } catch (_) {} }));
    return games;
  }
  async function enrich(game, { refresh = false } = {}) {
    if (game._enriched && !refresh) return game;
    try {
      const league = LEAGUES[game.leagueId || activeLeague], response = await fetch(`${base(league.slug)}/summary?event=${game.id}`); if (!response.ok) return game;
      const summary = await response.json(), plays = summary.keyEvents || summary.plays || [], competition = summary.header?.competitions?.[0], status = competition?.status || summary.header?.status;
      if (status) { game.status = status.type?.detail || status.displayClock || game.status; game.completed = status.type?.completed === true; game.live = isLiveStatus(status); }
      (competition?.competitors || []).forEach(team => { if (team.homeAway === 'home' && team.score != null) game.homeScore = Number(team.score); if (team.homeAway === 'away' && team.score != null) game.awayScore = Number(team.score); });
      game.summary = summary; game.injuries = summary.injuries || [];
      const providerRosters = summary.rosters?.length ? summary.rosters : (summary.boxscore?.players || []);
      game.rosters = providerRosters.map(roster => { const players = roster.statistics ? roster.statistics.flatMap(group => group.athletes || []) : (roster.roster || roster.athletes || []); return { ...roster, roster: players, starters: players.filter(player => player.starter === true || player.isStarter === true), substitutes: players.filter(player => player.substitute === true || player.isSubstitute === true) }; });
      game.events = plays.map(play => { const text = clean(play.text || play.shortText), clock = String(play.clock?.displayValue || ''), participants = play.participants || [], minute = Number((clock || text).match(/\d+/)?.[0]), type = /goal/i.test(text) ? 'goal' : /red card/i.test(text) ? 'red' : /yellow card/i.test(text) ? 'yellow' : /penalty/i.test(text) ? 'penalty' : /substitution|replaces/i.test(text) ? 'sub' : /injur/i.test(text) ? 'injury' : 'other'; return { type, minute: Number.isFinite(minute) ? minute : null, stoppage: /(?:45|90)\+\d+/.test(clock) || /(?:45|90)\+\d+/.test(text), text, teamId: String(play.team?.id || participants[0]?.team?.id || ''), players: participants.map(participant => clean(participant.athlete?.displayName || participant.displayName)).filter(Boolean), scorer: clean(participants[0]?.athlete?.displayName), assist: clean(play.assist?.athlete?.displayName), homeScore: Number.isFinite(Number(play.homeScore)) ? Number(play.homeScore) : null, awayScore: Number.isFinite(Number(play.awayScore)) ? Number(play.awayScore) : null, ownGoal: /own goal/i.test(text) }; });
      game._enriched = true;
    } catch (error) { console.warn('Could not enrich match', error); }
    return game;
  }
  return { leagues: LEAGUES, get activeLeague() { return activeLeague; }, setLeague: id => { if (!LEAGUES[id]) throw Error('Unknown league.'); activeLeague = id; }, load, enrich, refresh, normalize };
})();
