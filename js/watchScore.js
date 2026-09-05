/* Scores use only fields supplied by the provider. Missing components are omitted. */
window.WatchScore = (() => {
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  function score(game){
    const h=Number(game.homeScore), a=Number(game.awayScore);
    if(!Number.isFinite(h)||!Number.isFinite(a)) return null;
    const goals=h+a, diff=Math.abs(h-a), events=game.events||[];
    const goalEvents=events.filter(e=>e.type==='goal');
    const late=goalEvents.filter(e=>e.minute>=76).length, stoppage=goalEvents.filter(e=>e.stoppage===true).length;
    const leadChanges=game.leadChanges ?? null, equalizers=game.equalizers ?? null;
    const drama=clamp(18 + (diff===0?28:diff===1?26:diff===2?10:0) + Math.min(goals,6)*5 + late*8 + stoppage*8 + (leadChanges||0)*8 + (equalizers||0)*5 + (game.comeback?12:0));
    const actionParts=[Math.min(60,goals*11)];
    if(Number.isFinite(game.shotsOnTarget)) actionParts.push(clamp(game.shotsOnTarget*5));
    if(game.penalties) actionParts.push(clamp(game.penalties*28));
    if(game.redCards) actionParts.push(clamp(game.redCards*25));
    const action=actionParts.reduce((x,y)=>x+y,0)/actionParts.length;
    const hats=events.filter(e=>e.hatTrick).length, multi=events.filter(e=>e.multiGoal).length;
    const exceptionalParts=[]; if(hats) exceptionalParts.push(clamp(55+hats*22)); if(multi) exceptionalParts.push(clamp(25+multi*15)); if(game.ownGoals) exceptionalParts.push(clamp(20+game.ownGoals*25)); if(game.penalties>1) exceptionalParts.push(45); if(game.redCards>1) exceptionalParts.push(50);
    const context=Number.isFinite(game.contextScore)?game.contextScore:null;
    const parts=[['drama',drama,40],['action',action,25]]; if(exceptionalParts.length)parts.push(['exceptional',Math.max(...exceptionalParts),20]); if(context!==null)parts.push(['surpriseContext',context,15]);
    const w=parts.reduce((s,p)=>s+p[2],0); const total=Math.round(parts.reduce((s,p)=>s+p[1]*p[2],0)/w);
    return {watchScore:total,drama:Math.round(drama),action:Math.round(action),exceptional:exceptionalParts.length?Math.round(Math.max(...exceptionalParts)):null,surpriseContext:context,available:parts.map(p=>p[0])};
  }
  function reasons(game,s){const e=game.events||[],r=[];const goals=+game.homeScore + +game.awayScore;if(goals>=5)r.push(`${goals}-goal match`);if(Math.abs(game.homeScore-game.awayScore)===1)r.push('One-goal finish');if(e.some(x=>x.stoppage===true))r.push('Goal in stoppage time');if(game.comeback)r.push('Winner came from behind');if(e.some(x=>x.hatTrick))r.push('Hat-trick performance');if(!r.length)r.push('A closely contested Premier League match');return r.slice(0,4)}
  return {score,reasons};
})();
