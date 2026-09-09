window.EPLData = (() => {
  const LEAGUES = {
    epl: { id: 'epl', sport: 'soccer', slug: 'eng.1', name: 'Premier League', shortName: 'PREMIER LEAGUE', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/eng.1.png' },
    laliga: { id: 'laliga', sport: 'soccer', slug: 'esp.1', name: 'La Liga', shortName: 'LA LIGA', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/esp.1.png' },
    mlb: { id: 'mlb', sport: 'baseball', slug: 'mlb', name: 'Major League Baseball', shortName: 'MLB', logo: 'https://a.espncdn.com/i/leaguelogos/mlb/500/mlb.png', pastCap: 54, futureCap: 110 }
  };
  const MLB_BASE = 'https://statsapi.mlb.com/api/v1', MLB_LIVE = 'https://statsapi.mlb.com/api/v1.1';
  let activeLeague = 'epl';
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const color = team => team?.color ? `#${team.color}` : '#77736a';
  const soccerBase = slug => `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}`;
  const formatSoccerDate = date => date.toISOString().slice(0, 10).replaceAll('-', '');
  const formatMlbDate = date => date.toISOString().slice(0, 10);
  const soccerDateRange = () => { const now = new Date(), start = new Date(now), end = new Date(now); start.setDate(now.getDate() - 50); end.setDate(now.getDate() + 80); return `${formatSoccerDate(start)}-${formatSoccerDate(end)}`; };
  const mlbWindow = () => { const now = new Date(), start = new Date(now), end = new Date(now); start.setDate(now.getDate() - 3); end.setDate(now.getDate() + 7); return { startDate: formatMlbDate(start), endDate: formatMlbDate(end) }; };
  const isLiveStatus = status => { const type = status?.type || status || {}, name = String(type.name || status?.name || ''); return type.state === 'in' || status?.state === 'in' || /^STATUS_(?:FIRST|SECOND|HALF|EXTRA|IN_PROGRESS)/.test(name); };
  const mlbLogo = id => id ? `https://www.mlbstatic.com/team-logos/${id}.svg` : '';

  function normalize(event, league = LEAGUES[activeLeague]) {
    const competition = event.competitions?.[0], teams = competition?.competitors || [], home = teams.find(team => team.homeAway === 'home'), away = teams.find(team => team.homeAway === 'away');
    if (!home || !away) return null;
    const completed = event.status?.type?.completed === true, live = isLiveStatus(event.status), scored = completed || live;
    return { id: event.id, sport: 'soccer', leagueId: league.id, league: league.name, leagueLogo: league.logo, time: new Date(event.date), home: clean(home.team.displayName), away: clean(away.team.displayName), homeId: String(home.team.id || ''), awayId: String(away.team.id || ''), homeAbbr: home.team.abbreviation, awayAbbr: away.team.abbreviation, homeLogo: home.team.logo || home.team.logos?.[0]?.href || '', awayLogo: away.team.logo || away.team.logos?.[0]?.href || '', homeColor: color(home.team), awayColor: color(away.team), homeScore: scored ? Number(home.score) : null, awayScore: scored ? Number(away.score) : null, completed, live, venue: clean(competition.venue?.fullName), status: event.status?.type?.detail || '', events: [], raw: event };
  }

  function normalizeMlb(game, league = LEAGUES.mlb) {
    const home = game.teams?.home, away = game.teams?.away, status = game.status || {};
    if (!home?.team || !away?.team) return null;
    const completed = status.abstractGameState === 'Final', live = status.abstractGameState === 'Live', scored = completed || live;
    return { id: String(game.gamePk), sport: 'baseball', leagueId: league.id, league: league.name, leagueLogo: league.logo, time: new Date(game.gameDate), home: clean(home.team.name), away: clean(away.team.name), homeId: String(home.team.id), awayId: String(away.team.id), homeAbbr: home.team.abbreviation, awayAbbr: away.team.abbreviation, homeLogo: mlbLogo(home.team.id), awayLogo: mlbLogo(away.team.id), homeColor: '#77736a', awayColor: '#b5b5b0', homeScore: scored ? Number(home.score) : null, awayScore: scored ? Number(away.score) : null, completed, live, venue: clean(game.venue?.name), status: status.detailedState || status.abstractGameState || '', probableHomePitcher: home.probablePitcher || null, probableAwayPitcher: away.probablePitcher || null, gameNumber: game.gameNumber, doubleHeader: game.doubleHeader, events: [], raw: game };
  }

  const addSoccerContext = (games, ranks) => games.forEach(game => {
    const home = ranks[game.home], away = ranks[game.away]; if (!Number.isFinite(home) || !Number.isFinite(away)) return;
    game.homeRank = home; game.awayRank = away;
    const competitiveness = 100 - Math.min(70, Math.abs(home - away) * 7), stakes = home <= 6 && away <= 6 ? 20 : home >= 15 && away >= 15 ? 12 : 0;
    game.contextScore = Math.round(Math.min(100, competitiveness + stakes));
  });
  const addMlbContext = (games, table) => games.forEach(game => {
    const home = table[String(game.homeId)], away = table[String(game.awayId)];
    if (!home || !away) return;
    Object.assign(game, { homeRank: home.rank, awayRank: away.rank, homeWins: home.wins, homeLosses: home.losses, awayWins: away.wins, awayLosses: away.losses, homeGamesBack: home.gamesBack, awayGamesBack: away.gamesBack });
    const homePct = home.wins / Math.max(1, home.wins + home.losses), awayPct = away.wins / Math.max(1, away.wins + away.losses);
    const competitiveness = 100 - Math.min(68, Math.abs(homePct - awayPct) * 290), lateSeason = game.time.getMonth() >= 8 ? 14 : game.time.getMonth() >= 7 ? 7 : 0;
    game.contextScore = Math.round(Math.min(100, competitiveness + lateSeason));
  });

  async function loadSoccer(id) {
    const league = LEAGUES[id];
    const [fixtures, standings] = await Promise.all([fetch(`${soccerBase(league.slug)}/scoreboard?limit=1000&dates=${soccerDateRange()}`), fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${league.slug}/standings`).catch(() => null)]);
    if (!fixtures.ok) throw Error(`${league.name} fixtures are unavailable (${fixtures.status}).`);
    const games = ((await fixtures.json()).events || []).map(event => normalize(event, league)).filter(Boolean);
    if (!games.length) throw Error(`The ${league.name} feed returned no fixtures for this period.`);
    const ranks = {}; try { const table = standings?.ok ? await standings.json() : null; (table?.children || []).flatMap(group => group.standings?.entries || []).forEach(entry => { const rank = entry.stats?.find(stat => stat.name === 'rank')?.value; if (Number.isFinite(rank)) ranks[clean(entry.team?.displayName)] = rank; }); } catch (_) {}
    addSoccerContext(games, ranks); return games;
  }

  async function loadMlb() {
    const league = LEAGUES.mlb, { startDate, endDate } = mlbWindow();
    const [scheduleResponse, standingsResponse] = await Promise.all([
      fetch(`${MLB_BASE}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&hydrate=linescore,probablePitcher,decisions`),
      fetch(`${MLB_BASE}/standings?leagueId=103,104&season=${new Date().getFullYear()}&standingsTypes=regularSeason`).catch(() => null)
    ]);
    if (!scheduleResponse.ok) throw Error(`MLB fixtures are unavailable (${scheduleResponse.status}).`);
    const schedule = await scheduleResponse.json(), games = (schedule.dates || []).flatMap(date => date.games || []).map(game => normalizeMlb(game, league)).filter(Boolean), now = Date.now(), pastHorizon = now - 3 * 864e5, futureHorizon = now + 7 * 864e5;
    // Status, rather than scheduled first-pitch time, keeps rain delays and live games
    // in the active/future section instead of accidentally treating them as history.
    const past = games.filter(game => game.completed && game.time >= pastHorizon).sort((a, b) => b.time - a.time).slice(0, league.pastCap).reverse();
    const future = games.filter(game => !game.completed && game.time <= futureHorizon).sort((a, b) => a.time - b.time).slice(0, league.futureCap);
    const limited = [...past, ...future];
    if (!limited.length) throw Error('The MLB feed returned no games in the current window.');
    const table = {}; try { const standings = standingsResponse?.ok ? await standingsResponse.json() : null; (standings?.records || []).flatMap(record => record.teamRecords || []).forEach(entry => { table[String(entry.team?.id)] = { rank: Number(entry.divisionRank), wins: Number(entry.wins), losses: Number(entry.losses), gamesBack: entry.gamesBack }; }); } catch (_) {}
    addMlbContext(limited, table); return limited;
  }
  async function load(id = activeLeague) { const league = LEAGUES[id]; if (!league) throw Error('Unknown league.'); activeLeague = id; return league.sport === 'baseball' ? loadMlb() : loadSoccer(id); }

  function mlbScore(game, feed) {
    const linescore = feed.liveData?.linescore || {}, teams = linescore.teams || {}, away = teams.away || {}, home = teams.home || {}, plays = (feed.liveData?.plays?.allPlays || []).filter(play => play.about?.isScoringPlay), finalHome = Number(home.runs ?? game.homeScore ?? 0), finalAway = Number(away.runs ?? game.awayScore ?? 0), finalMargin = Math.abs(finalHome - finalAway), extra = (linescore.innings || []).length > 9;
    let previousLeader = 0, leadChanges = 0, ties = 0, lateSwing = 0, maxCaptivating = 0, grandSlams = 0;
    plays.forEach(play => { const homeScore = Number(play.result?.homeScore || 0), awayScore = Number(play.result?.awayScore || 0), leader = Math.sign(homeScore - awayScore), inning = Number(play.about?.inning || 0); if (leader === 0 && previousLeader !== 0) ties++; if (leader !== 0 && previousLeader !== 0 && leader !== previousLeader) leadChanges++; if (inning >= 7 && leader !== previousLeader) lateSwing++; previousLeader = leader || previousLeader; maxCaptivating = Math.max(maxCaptivating, Number(play.about?.captivatingIndex || 0)); if (Number(play.result?.rbi || 0) >= 4 && /home run/i.test(play.result?.event || '')) grandSlams++; });
    const totalRuns = finalHome + finalAway, totalHits = Number(home.hits || 0) + Number(away.hits || 0), drama = Math.round(Math.min(100, (finalMargin === 1 ? 30 : finalMargin === 2 ? 14 : 0) + (extra ? 25 : 0) + leadChanges * 18 + ties * 7 + lateSwing * 10 + maxCaptivating * .23)), action = Math.round(Math.min(100, totalRuns * 5 + totalHits * 1.7 + plays.filter(play => /home run/i.test(play.result?.event || '')).length * 8)), exceptional = Math.round(Math.min(100, grandSlams * 30 + (extra ? 12 : 0) + ((home.hits === 0 || away.hits === 0) ? 30 : (home.hits === 1 || away.hits === 1) ? 16 : 0) + plays.filter(play => Number(play.result?.rbi || 0) >= 3).length * 10)), surpriseContext = Number.isFinite(game.contextScore) ? game.contextScore : 40, watchScore = Math.round(drama * .45 + action * .25 + exceptional * .2 + surpriseContext * .1);
    return { watchScore, drama, action, exceptional, surpriseContext, reasons: [extra && 'Extra innings', finalMargin === 1 && 'One-run finish', leadChanges && `${leadChanges} lead change${leadChanges === 1 ? '' : 's'}`, lateSwing && 'Late-inning swing', grandSlams && 'Grand slam'].filter(Boolean), mlb: true };
  }

  const flattenStats = team => Object.entries(team?.teamStats || {}).flatMap(([, values]) => Object.entries(values || {}).filter(([, value]) => typeof value === 'number' || typeof value === 'string').map(([name, value]) => ({ name, value, displayValue: String(value) })));
  function enrichMlbRoster(game, feed) {
    const sides = feed.liveData?.boxscore?.teams || {}, entries = Object.entries(sides);
    game.rosters = entries.map(([side, team]) => {
      const order = new Set((team.battingOrder || []).map(String)), bench = new Set((team.bench || []).map(String)), bullpen = new Set((team.bullpen || []).map(String)), people = Object.values(team.players || {});
      const roster = people.map(item => ({ athlete: { id: item.person?.id, displayName: item.person?.fullName, fullName: item.person?.fullName, jersey: item.jerseyNumber, position: { abbreviation: item.position?.abbreviation || item.position?.code || '' }, birthDate: item.person?.birthDate }, jersey: item.jerseyNumber, position: { abbreviation: item.position?.abbreviation || item.position?.code || '' }, starter: order.has(String(item.person?.id)), substitute: bench.has(String(item.person?.id)) || bullpen.has(String(item.person?.id)) }));
      const source = side === 'home' ? { id: game.homeId, abbreviation: game.homeAbbr, logo: game.homeLogo } : { id: game.awayId, abbreviation: game.awayAbbr, logo: game.awayLogo };
      return { team: source, roster, starters: roster.filter(player => player.starter), substitutes: roster.filter(player => player.substitute) };
    });
    game.lineupAvailable = entries.length === 2 && entries.every(([, team]) => (team.battingOrder || []).length === 9);
  }
  async function enrichMlb(game, { refresh = false } = {}) {
    if (game._enriched && !refresh) return game;
    try {
      const response = await fetch(`${MLB_LIVE}/game/${game.id}/feed/live`); if (!response.ok) return game;
      const feed = await response.json(), status = feed.gameData?.status || {}, linescore = feed.liveData?.linescore || {}, sides = linescore.teams || {};
      game.status = status.detailedState || game.status; game.completed = status.abstractGameState === 'Final'; game.live = status.abstractGameState === 'Live';
      if (game.completed || game.live) { game.homeScore = Number(sides.home?.runs ?? game.homeScore ?? 0); game.awayScore = Number(sides.away?.runs ?? game.awayScore ?? 0); }
      game.probableHomePitcher = feed.gameData?.probablePitchers?.home || game.probableHomePitcher; game.probableAwayPitcher = feed.gameData?.probablePitchers?.away || game.probableAwayPitcher;
      enrichMlbRoster(game, feed);
      game.events = (feed.liveData?.plays?.allPlays || []).filter(play => play.about?.isScoringPlay).map(play => ({ type: 'run', minute: Number(play.about?.inning || 0), inning: play.about?.inning, half: play.about?.halfInning, text: clean(play.result?.description), teamId: String(play.team?.id || ''), scorer: clean(play.matchup?.batter?.fullName), homeScore: Number(play.result?.homeScore), awayScore: Number(play.result?.awayScore), rbi: Number(play.result?.rbi || 0), captivating: Number(play.about?.captivatingIndex || 0) }));
      game.summary = { boxscore: { teams: Object.entries(sides).map(([side]) => ({ team: { id: side === 'home' ? game.homeId : game.awayId }, statistics: flattenStats(feed.liveData?.boxscore?.teams?.[side]) })) } };
      if (game.completed) game.scoreResult = mlbScore(game, feed);
      game._enriched = true;
    } catch (error) { console.warn('Could not enrich MLB game', error); }
    return game;
  }

  async function enrichSoccer(game, { refresh = false } = {}) {
    if (game._enriched && !refresh) return game;
    try {
      const league = LEAGUES[game.leagueId || activeLeague], response = await fetch(`${soccerBase(league.slug)}/summary?event=${game.id}`); if (!response.ok) return game;
      const summary = await response.json(), plays = summary.keyEvents || summary.plays || [], competition = summary.header?.competitions?.[0], status = competition?.status || summary.header?.status;
      if (status) { game.status = status.type?.detail || status.displayClock || game.status; game.completed = status.type?.completed === true; game.live = isLiveStatus(status); }
      (competition?.competitors || []).forEach(team => { if (team.homeAway === 'home' && team.score != null) game.homeScore = Number(team.score); if (team.homeAway === 'away' && team.score != null) game.awayScore = Number(team.score); });
      game.summary = summary; game.injuries = summary.injuries || [];
      const providerRosters = summary.rosters?.length ? summary.rosters : (summary.boxscore?.players || []);
      game.rosters = providerRosters.map(roster => {
        const groups = roster.statistics || roster.groups || [], grouped = groups.flatMap(group => group.athletes || group.players || group.entries || []), raw = roster.roster || roster.athletes || roster.entries || roster.players || [];
        const unique = entries => [...new Map(entries.filter(Boolean).map((entry, index) => { const player = entry.athlete || entry; return [String(player.id || player.uid || player.displayName || player.fullName || index), entry]; })).values()];
        const named = expression => groups.filter(group => expression.test(String(group.name || group.displayName || group.label || group.title || ''))).flatMap(group => group.athletes || group.players || group.entries || []);
        const players = unique([...raw, ...grouped]), starters = unique([...named(/start|lineup|xi/i), ...players.filter(player => player.starter === true || player.isStarter === true || player.status?.type === 'starter')]);
        let substitutes = unique([...named(/sub|bench|reserve/i), ...players.filter(player => player.substitute === true || player.isSubstitute === true || player.status?.type === 'substitute' || player.status?.type === 'bench')]);
        if (!substitutes.length && starters.length) { const starterIds = new Set(starters.map(entry => { const player = entry.athlete || entry; return String(player.id || player.uid || player.displayName || player.fullName); })); substitutes = players.filter(entry => { const player = entry.athlete || entry; return !starterIds.has(String(player.id || player.uid || player.displayName || player.fullName)); }); }
        return { ...roster, roster: players, starters, substitutes };
      });
      game.events = plays.map(play => { const text = clean(play.text || play.shortText), clock = String(play.clock?.displayValue || ''), participants = play.participants || [], minute = Number((clock || text).match(/\d+/)?.[0]), type = /goal/i.test(text) ? 'goal' : /red card/i.test(text) ? 'red' : /yellow card/i.test(text) ? 'yellow' : /penalty/i.test(text) ? 'penalty' : /substitution|replaces/i.test(text) ? 'sub' : /injur/i.test(text) ? 'injury' : 'other'; return { type, minute: Number.isFinite(minute) ? minute : null, stoppage: /(?:45|90)\+\d+/.test(clock) || /(?:45|90)\+\d+/.test(text), text, teamId: String(play.team?.id || participants[0]?.team?.id || ''), players: participants.map(participant => clean(participant.athlete?.displayName || participant.displayName)).filter(Boolean), scorer: clean(participants[0]?.athlete?.displayName), assist: clean(play.assist?.athlete?.displayName), homeScore: Number.isFinite(Number(play.homeScore)) ? Number(play.homeScore) : null, awayScore: Number.isFinite(Number(play.awayScore)) ? Number(play.awayScore) : null, ownGoal: /own goal/i.test(text) }; });
      game._enriched = true;
    } catch (error) { console.warn('Could not enrich match', error); }
    return game;
  }

  async function refresh(games) {
    const groups = [...new Set(games.map(game => game.leagueId || activeLeague))];
    await Promise.all(groups.map(async id => {
      const league = LEAGUES[id]; if (!league) return;
      try {
        if (league.sport === 'baseball') { const fresh = new Map((await loadMlb()).map(game => [String(game.id), game])); games.filter(game => game.leagueId === id).forEach(game => { const update = fresh.get(String(game.id)); if (update) Object.assign(game, { live: update.live, completed: update.completed, status: update.status, homeScore: update.homeScore, awayScore: update.awayScore, probableHomePitcher: update.probableHomePitcher, probableAwayPitcher: update.probableAwayPitcher }); }); return; }
        const response = await fetch(`${soccerBase(league.slug)}/scoreboard?limit=1000&dates=${soccerDateRange()}`); if (!response.ok) return;
        const fresh = new Map(((await response.json()).events || []).map(event => normalize(event, league)).filter(Boolean).map(game => [String(game.id), game])); games.filter(game => game.leagueId === id).forEach(game => { const update = fresh.get(String(game.id)); if (update) Object.assign(game, { live: update.live, completed: update.completed, status: update.status, homeScore: update.homeScore, awayScore: update.awayScore }); });
      } catch (_) {}
    })); return games;
  }
  const enrich = (game, options) => game.sport === 'baseball' ? enrichMlb(game, options) : enrichSoccer(game, options);
  return { leagues: LEAGUES, get activeLeague() { return activeLeague; }, setLeague: id => { if (!LEAGUES[id]) throw Error('Unknown league.'); activeLeague = id; }, load, enrich, refresh, normalize, normalizeMlb };
})();
