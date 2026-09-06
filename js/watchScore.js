/*
 * Watch Index v2 values sustained pressure and uncertainty over raw goal volume.
 * Components are bounded before combining, so unusual raw provider values cannot
 * overwhelm the recommendation.
 */
window.WatchScore = (() => {
  const WEIGHTS = { action: 30, drama: 30, competitiveness: 25, surpriseContext: 15 };
  const clamp = (value, low = 0, high = 100) => Math.max(low, Math.min(high, value));
  const round = value => Math.round(clamp(value));
  const saturate = (value, knee) => 100 * (1 - Math.exp(-Math.max(0, value) / knee));
  const balanced = (left, right) => {
    const total = Number(left) + Number(right);
    return total > 0 ? 1 - Math.abs(left - right) / total : 0;
  };

  const STAT_ALIASES = {
    shots: ['shots', 'totalshots', 'shotstotal'],
    shotsOnTarget: ['shotsontarget', 'shotsongoal', 'shotsontargettotal'],
    saves: ['saves', 'goalkeepersaves'],
    corners: ['corners', 'cornerkicks', 'totalcorners'],
    boxTouches: ['touchesinoppositionbox', 'touchesinoppositionarea', 'touchesinthebox', 'touchesinbox']
  };
  const statKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const statNumber = value => {
    const found = String(value ?? '').match(/-?\d+(?:\.\d+)?/);
    return found ? Number(found[0]) : null;
  };

  function statistics(game) {
    if (game.boxScoreStats) return game.boxScoreStats;
    const teams = game.summary?.boxscore?.teams || game.summary?.boxscore?.teamStats || [];
    const result = { home: {}, away: {} };
    teams.forEach((team, index) => {
      const id = String(team.team?.id || team.id || '');
      const side = id && id === String(game.homeId) ? 'home' : id && id === String(game.awayId) ? 'away' : index === 0 ? 'home' : 'away';
      (team.statistics || team.stats || []).forEach(stat => {
        const key = statKey(stat.name || stat.label || stat.displayName);
        const value = statNumber(stat.displayValue ?? stat.value);
        if (value === null) return;
        Object.entries(STAT_ALIASES).forEach(([name, aliases]) => {
          if (aliases.includes(key)) result[side][name] = value;
        });
      });
    });
    return result;
  }

  function scoreTimeline(game) {
    const homeId = String(game.homeId || ''), awayId = String(game.awayId || '');
    let home = 0, away = 0;
    return (game.events || []).filter(event => event.type === 'goal' && Number.isFinite(event.minute))
      .sort((a, b) => a.minute - b.minute).map(event => {
        const before = { home, away };
        const suppliedHome = Number(event.homeScore), suppliedAway = Number(event.awayScore);
        if (Number.isFinite(suppliedHome) && Number.isFinite(suppliedAway) && (suppliedHome || suppliedAway)) {
          home = suppliedHome; away = suppliedAway;
        } else if (String(event.teamId) === homeId) home += 1;
        else if (String(event.teamId) === awayId) away += 1;
        else return null; // Never invent state for an unassigned own goal.
        return { ...event, before, after: { home, away } };
      }).filter(Boolean);
  }

  function actionScore(game, stats) {
    const parts = [];
    const add = (name, knee, weight) => {
      const home = stats.home[name], away = stats.away[name];
      if (!Number.isFinite(home) || !Number.isFinite(away)) return;
      // Pressure from both teams is materially more watchable than one-sided volume.
      parts.push({ value: saturate(home + away, knee) * (0.5 + 0.5 * balanced(home, away)), weight });
    };
    add('shotsOnTarget', 9, 0.48);
    add('saves', 7, 0.22);
    add('shots', 24, 0.16);
    add('corners', 11, 0.08);
    add('boxTouches', 26, 0.06);
    const goals = Math.max(0, Number(game.homeScore) + Number(game.awayScore));
    const margin = Math.abs(Number(game.homeScore) - Number(game.awayScore));
    // A modest event floor permits incomplete box scores without mistaking goals for action.
    const goalActivity = clamp(8 + goals * 11 + (margin <= 1 ? 8 : 0), 8, 65);
    if (!parts.length) return goalActivity;
    const pressure = parts.reduce((sum, part) => sum + part.value * part.weight, 0) / parts.reduce((sum, part) => sum + part.weight, 0);
    return clamp(pressure * 0.88 + goalActivity * 0.12);
  }

  function scoreAt(timeline, minute) {
    let home = 0, away = 0;
    timeline.forEach(goal => { if (goal.minute <= minute) ({ home, away } = goal.after); });
    return { home, away };
  }

  function dramaScore(game, timeline) {
    let drama = 18, leadChanges = 0, equalizers = 0;
    timeline.forEach(goal => {
      const beforeDiff = goal.before.home - goal.before.away, afterDiff = goal.after.home - goal.after.away;
      const madeLevel = beforeDiff !== 0 && afterDiff === 0;
      const changedLeader = beforeDiff !== 0 && afterDiff !== 0 && Math.sign(beforeDiff) !== Math.sign(afterDiff);
      const tookLead = beforeDiff === 0 && afterDiff !== 0;
      const reducedLargeLead = Math.abs(beforeDiff) >= 2 && Math.abs(afterDiff) < Math.abs(beforeDiff);
      if (madeLevel) { drama += 22; equalizers += 1; }
      else if (changedLeader) { drama += 25; leadChanges += 1; }
      else if (tookLead) drama += 8;
      else if (reducedLargeLead) drama += 6;
      if (goal.minute >= 76) drama += 8;
      if (goal.minute >= 86) drama += 7;
      if (goal.stoppage) drama += 11;
      if (goal.minute >= 85 && Math.abs(afterDiff) === 1) drama += 7;
    });
    // Several scoring incidents make a match less inert even when one side controls it.
    // This is deliberately small and capped: goal count alone cannot create a great score.
    if (timeline.length >= 3) drama += 12;
    (game.events || []).filter(event => ['red', 'penalty'].includes(event.type)).forEach(event => {
      if (!Number.isFinite(event.minute)) return;
      const state = scoreAt(timeline, event.minute), close = Math.abs(state.home - state.away) <= 1;
      const missed = /missed|saved|off target/i.test(event.text || '');
      if (event.type === 'red') drama += close ? 9 : 3;
      if (event.type === 'penalty') drama += missed ? 9 : close ? 5 : 2;
    });
    const targetSign = Math.sign(Number(game.homeScore) - Number(game.awayScore));
    const comebackWinner = targetSign !== 0 && timeline.some(goal => Math.sign(goal.after.home - goal.after.away) === -targetSign && Math.abs(goal.after.home - goal.after.away) >= 2);
    if (game.comeback || comebackWinner) drama += 14;
    const shotsOnTarget = (statistics(game).home.shotsOnTarget || 0) + (statistics(game).away.shotsOnTarget || 0);
    if (shotsOnTarget >= 12 && balanced(statistics(game).home.shotsOnTarget, statistics(game).away.shotsOnTarget) >= 0.7) drama += 14;
    return { score: clamp(drama), leadChanges, equalizers, comebackWinner };
  }

  function competitivenessScore(game, timeline, stats) {
    const end = 95;
    let prior = 0, tied = 0, withinOne = 0, settled = 0;
    [...timeline, { minute: end }].forEach(point => {
      const minute = clamp(point.minute, prior, end), duration = minute - prior;
      const state = scoreAt(timeline, prior === 0 ? 0 : prior + 0.01), difference = Math.abs(state.home - state.away);
      if (difference === 0) tied += duration;
      if (difference <= 1) withinOne += duration;
      if (difference >= 2) settled += duration;
      prior = minute;
    });
    const finalDiff = Math.abs(Number(game.homeScore) - Number(game.awayScore));
    const late = scoreAt(timeline, 75);
    const homeSot = stats.home.shotsOnTarget || 0, awaySot = stats.away.shotsOnTarget || 0;
    const pressureBalance = balanced(homeSot, awaySot);
    let score = 19 + tied / end * 34 + withinOne / end * 28 + (finalDiff <= 1 ? 10 : 0) + (Math.abs(late.home - late.away) <= 1 ? 10 : 0) + pressureBalance * 7 - settled / end * 23;
    // A 0–0 is only competitive television when chance creation supports the tension.
    // Without shots on target and saves, a long deadlock should not inherit a high score.
    if (Number(game.homeScore) + Number(game.awayScore) === 0) {
      const pressureEvidence = clamp((homeSot + awaySot + (stats.home.saves || 0) + (stats.away.saves || 0)) / 24, 0, 1);
      score *= 0.10 + pressureEvidence * 0.90;
    }
    return clamp(score);
  }

  function contextScore(game) {
    const homeRank = Number(game.homeRank), awayRank = Number(game.awayRank);
    let value = null;
    if (Number.isFinite(homeRank) && Number.isFinite(awayRank)) {
      const winner = Number(game.homeScore) === Number(game.awayScore) ? null : Number(game.homeScore) > Number(game.awayScore) ? 'home' : 'away';
      const gap = Math.abs(homeRank - awayRank);
      const underdogWon = winner === 'home' ? homeRank > awayRank : winner === 'away' ? awayRank > homeRank : false;
      value = 35 + (gap <= 4 ? 26 : 8) + (underdogWon ? saturate(gap, 7) * 0.55 : 0);
    }
    // Existing context reflects table proximity / stakes; it is not falsely labelled an upset.
    if (Number.isFinite(game.contextScore)) {
      const fixtureContext = 35 + game.contextScore * 0.45;
      value = value === null ? fixtureContext : Math.max(value, fixtureContext);
    }
    return value === null ? null : clamp(value);
  }

  function combine(parts) {
    const active = parts.filter(part => Number.isFinite(part.value));
    const weight = active.reduce((sum, part) => sum + part.weight, 0);
    return round(active.reduce((sum, part) => sum + part.value * part.weight, 0) / weight);
  }

  function score(game) {
    const home = Number(game.homeScore), away = Number(game.awayScore);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
    const stats = statistics(game), timeline = scoreTimeline(game);
    const drama = dramaScore(game, timeline), competitiveness = competitivenessScore(game, timeline, stats);
    const context = contextScore(game), action = actionScore(game, stats);
    const baseScore = combine([
      { value: action, weight: WEIGHTS.action }, { value: drama.score, weight: WEIGHTS.drama },
      { value: competitiveness, weight: WEIGHTS.competitiveness }, { value: context, weight: WEIGHTS.surpriseContext }
    ]);
    // A team overturning a two-goal deficit to win is a distinctive match arc.
    const watchScore = round(baseScore + (drama.comebackWinner ? 14 : 0));
    return {
      watchScore, action: round(action), drama: round(drama.score), competitiveness: round(competitiveness),
      // Kept as a compatibility alias for older UI code.
      exceptional: round(competitiveness), surpriseContext: context === null ? null : round(context),
      available: ['action', 'drama', 'competitiveness', ...(context === null ? [] : ['surpriseContext'])],
      diagnostics: { goals: timeline.length, leadChanges: drama.leadChanges, equalizers: drama.equalizers, comebackWinner: drama.comebackWinner, stats }
    };
  }

  function reasons(game, result = score(game)) {
    const timeline = scoreTimeline(game), reasons = [];
    if (result?.diagnostics?.leadChanges) reasons.push('Lead changed hands');
    if (result?.diagnostics?.equalizers) reasons.push('An equalizer changed the match');
    if (timeline.some(goal => goal.stoppage)) reasons.push('Goal in stoppage time');
    else if (timeline.some(goal => goal.minute >= 86)) reasons.push('Late decisive moment');
    if ((game.events || []).some(event => event.type === 'red')) reasons.push('Red-card turning point');
    const stats = result?.diagnostics?.stats || statistics(game);
    if (Number(stats.home.shotsOnTarget) + Number(stats.away.shotsOnTarget) >= 10) reasons.push('High-pressure chance creation');
    if (!reasons.length && Math.abs(Number(game.homeScore) - Number(game.awayScore)) <= 1) reasons.push('A closely contested Premier League match');
    if (!reasons.length) reasons.push('A match shaped by its decisive moments');
    return reasons.slice(0, 4);
  }

  function validate() {
    const game = (label, homeScore, awayScore, events = [], boxScoreStats, contextScore) => ({ label, homeScore, awayScore, homeId: 'h', awayId: 'a', events, boxScoreStats, contextScore });
    const goal = (minute, teamId, homeScore, awayScore, extra = {}) => ({ type: 'goal', minute, teamId, homeScore, awayScore, ...extra });
    const pressure = (home, away) => ({ home, away });
    const cases = [
      game('0–0, sustained pressure', 0, 0, [], pressure({ shots: 18, shotsOnTarget: 8, saves: 7, corners: 8 }, { shots: 17, shotsOnTarget: 7, saves: 8, corners: 7 })),
      game('0–0, quiet', 0, 0, [], pressure({ shots: 4, shotsOnTarget: 1 }, { shots: 3, shotsOnTarget: 1 })),
      game('1–0, late winner', 1, 0, [goal(88, 'h', 1, 0)]),
      game('4–0, routine blowout', 4, 0, [goal(9, 'h', 1, 0), goal(21, 'h', 2, 0), goal(35, 'h', 3, 0), goal(68, 'h', 4, 0)]),
      game('2–2, late equalizer', 2, 2, [goal(14, 'h', 1, 0), goal(37, 'a', 1, 1), goal(64, 'h', 2, 1), goal(89, 'a', 2, 2)]),
      game('3–2, comeback and late winner', 3, 2, [goal(9, 'a', 0, 1), goal(22, 'a', 0, 2), goal(49, 'h', 1, 2), goal(72, 'h', 2, 2), goal(91, 'h', 3, 2, { stoppage: true })]),
      game('Favourite wins narrowly', 1, 0, [goal(32, 'h', 1, 0)], undefined, 42),
      { ...game('Major underdog upset', 1, 0, [
        { type: 'red', minute: 74, teamId: 'a', text: 'Red card' },
        { type: 'penalty', minute: 79, teamId: 'h', text: 'Penalty saved' }, goal(83, 'h', 1, 0)
      ], pressure({ shots: 18, shotsOnTarget: 8, saves: 8, corners: 7 }, { shots: 17, shotsOnTarget: 8, saves: 8, corners: 7 }), 72), homeRank: 19, awayRank: 1 }
    ];
    const rows = cases.map(sample => {
      const result = score(sample);
      return { Game: sample.label, Total: result.watchScore, Action: result.action, Drama: result.drama, Competitiveness: result.competitiveness, 'Context / surprise': result.surpriseContext ?? 'unavailable' };
    });
    console.table(rows);
    return rows;
  }

  return { score, reasons, validate, statistics, weights: WEIGHTS };
})();
