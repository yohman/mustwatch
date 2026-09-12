(()=>{let plot,games=[],activeLeague='epl',activeTeams=new Set(JSON.parse(localStorage.getItem('must-watch-teams')||'[]')),allLeagueTeamKeys=new Set(),logos={};const info=document.getElementById('match-info'),search=document.getElementById('team-search'),results=document.getElementById('team-results'),picker=document.getElementById('team-picker'),toggle=document.getElementById('team-toggle'),ribbon=document.getElementById('team-ribbon'),ribbonLabel=document.getElementById('team-hover-label'),teamPreview=document.getElementById('team-preview'),listShell=document.getElementById('list-shell'),plotShell=document.querySelector('.plot-shell'),viewToggle=document.querySelector('.view-toggle'),leagueSwitcher=document.getElementById('league-switcher');toggle.onclick=()=>{picker.hidden=!picker.hidden;if(!picker.hidden)search.focus()};
let listPositionLock=null;const listCardAnchors=new Map(),cardAnchor=card=>{const id=card?.dataset?.game,top=card?.getBoundingClientRect?.().top;if(!id||!Number.isFinite(top))return null;return{id,top,left:listShell.scrollLeft,until:Date.now()+3000}};
const renderAtCardAnchor=anchor=>{if(anchor)listPositionLock=anchor;renderList();if(!anchor)return;const holdPosition=()=>{const card=[...listShell.querySelectorAll('[data-game]')].find(node=>node.dataset.game===anchor.id);if(!card)return;const drift=card.getBoundingClientRect().top-anchor.top;if(Math.abs(drift)>.5)listShell.scrollTop=Math.max(0,listShell.scrollTop+drift)};holdPosition();requestAnimationFrame(holdPosition);setTimeout(holdPosition,80)};
const rerenderAtCard=card=>{const anchor=cardAnchor(card);if(anchor)listCardAnchors.set(anchor.id,anchor);renderAtCardAnchor(anchor)};
const rerenderAtGame=id=>renderAtCardAnchor(listCardAnchors.get(id));
listShell.addEventListener('click',event=>{const button=event.target.closest('[data-watch-toggle],[data-lineup],[data-results]'),card=event.target.closest('[data-game]');if(!button||!card)return;const game=games.find(g=>g.id===card.dataset.game);if(!game)return;event.preventDefault();event.stopImmediatePropagation();if(button.matches('[data-watch-toggle]')){if(game.__mwRevealed){game.__mwRevealed=false;game.displayScore=50;plot.render();rerenderAtCard(card)}else{plot.activate(game);rerenderAtCard(card)}return}if(button.matches('[data-lineup]')){game.__showLineup=!game.__showLineup;game.__showResults=false;if(game.__showLineup)EPLData.enrich(game).finally(()=>rerenderAtCard(card));else rerenderAtCard(card);return}game.__showResults=!game.__showResults;game.__showLineup=false;EPLData.enrich(game).finally(()=>rerenderAtCard(card))},true);
document.addEventListener('click',event=>{const button=event.target.closest('#match-info [data-lineup]');if(!button||!info.querySelector('.incident-list'))return;const title=info.querySelector('.result-title')?.textContent||'',game=games.find(g=>title.includes(g.homeAbbr||g.home)&&title.includes(g.awayAbbr||g.away));if(!game)return;event.preventDefault();event.stopImmediatePropagation();openInfo(game,false);const box=info.querySelector('[data-lineup-content]');box.innerHTML=rosterMarkup(game);info.querySelector('[data-lineup]').textContent='HIDE LINEUP'},true);
document.addEventListener('click',event=>{const button=event.target.closest('#match-info [data-results]');if(!button)return;const title=info.querySelector('.result-title')?.textContent||'',game=games.find(g=>title.includes(g.homeAbbr||g.home)&&title.includes(g.awayAbbr||g.away));if(!game)return;event.preventDefault();event.stopImmediatePropagation();openInfo(game,true)},true);
document.addEventListener('click',event=>{const button=event.target.closest('#match-info [data-watch]');if(!button)return;const title=info.querySelector('.result-title')?.textContent||'',game=games.find(g=>title.includes(g.homeAbbr||g.home)&&title.includes(g.awayAbbr||g.away));if(!game)return;event.preventDefault();event.stopImmediatePropagation();plot.activate(game);openInfo(game,false);info.querySelector('[data-watch]')?.classList.add('active')},true);
incidentTimeline=function(g){const events=(g.events||[]).filter(event=>['goal','red','yellow','penalty','sub'].includes(event.type));return events.map(event=>{const logo=event.teamId&&event.teamId===g.homeId?g.homeLogo:event.teamId&&event.teamId===g.awayId?g.awayLogo:'',icon=event.type==='goal'&&logo?`<img class="incident-badge" src="${logo}" aria-hidden="true">`:`<i class="incident-mark ${event.type}" aria-hidden="true"></i>`,text=event.scorer&&event.text.includes(event.scorer)?event.text.split(event.scorer).join(`<strong class="incident-player">${event.scorer}</strong>`):event.text;return `<div class="incident ${event.type}"><time>${Number.isFinite(event.minute)?`${event.minute}'`:'—'}</time>${icon}<span>${text}</span></div>`}).join('')||'<p>Detailed incidents are not yet available.</p>'};
listShell.addEventListener('click',event=>{const card=event.target.closest('[data-game]'),control=event.target.closest('[data-watch-toggle],[data-results],[data-lineup],[data-lineup-spoilers]');if(!card||control)return;const game=games.find(item=>item.id===card.dataset.game);if(!game?.completed)return;event.preventDefault();event.stopPropagation();if(game.__showResults||game.__showLineup){game.__showResults=false;game.__showLineup=false;rerenderAtCard(card)}},true);
const teamTable={};
// Club names repeat across competitions (for example Barcelona in La Liga and
// the Champions League), so standings must never be keyed by name alone.
const teamTableKey=(leagueId,team)=>`${leagueId||'epl'}:${String(team||'').trim()}`;
const tableLeagueLabel=game=>({laliga:'LA LIGA',ucl:'CHAMPIONS LEAGUE',mlb:'MLB',nfl:'NFL'}[game.leagueId]||'EPL');
async function loadTeamTable(id=activeLeague){
  Object.keys(teamTable).forEach(key=>delete teamTable[key]);
  const leagues=id==='all'?Object.values(EPLData.leagues):[EPLData.leagues[id]].filter(Boolean);
  leagues.filter(league=>league.sport==='baseball').forEach(()=>games.filter(game=>game.sport==='baseball').forEach(game=>{
    teamTable[teamTableKey(game.leagueId,game.home)]={rank:game.homeRank,wins:game.homeWins,losses:game.homeLosses,draws:null};
    teamTable[teamTableKey(game.leagueId,game.away)]={rank:game.awayRank,wins:game.awayWins,losses:game.awayLosses,draws:null};
  }));
  await Promise.all(leagues.filter(league=>league.sport!=='baseball').map(async league=>{
    try{
      const response=await fetch(`https://site.api.espn.com/apis/v2/sports/${league.sport}/${league.slug}/standings`),table=response.ok?await response.json():null;
      (table?.children||[]).flatMap(group=>group.standings?.entries||[]).forEach(entry=>{
        const stat=name=>entry.stats?.find(item=>item.name===name)?.value,name=entry.team?.displayName;
        if(name)teamTable[teamTableKey(league.id,name)]={rank:stat('rank')??stat('playoffSeed')??stat('divisionRank'),wins:stat('wins'),draws:stat('ties')??stat('draws'),losses:stat('losses')};
      });
    }catch(_){}
  }));
  if(games.length)renderList();
}
const ordinal=value=>{const n=Number(value),tail=n%100;return `${n}${tail>=11&&tail<=13?'th':n%10===1?'st':n%10===2?'nd':n%10===3?'rd':'th'}`};
ribbon.addEventListener('click',event=>{if(!event.target.closest('[data-team]'))return;requestAnimationFrame(()=>document.body.classList.contains('view-list')?document.getElementById('list-now')?.scrollIntoView({behavior:'smooth',block:'center'}):plot?.recenter())});
new MutationObserver(()=>{let changed=false;games.forEach(game=>{if(game.sport==='baseball'||game.raw?.week?.number)return;const season=game.raw?.season?.year,fixtures=games.filter(item=>item.raw?.season?.year===season).sort((a,b)=>a.time-b.time),index=fixtures.indexOf(game);if(index<0)return;game.raw.week={number:Math.floor(index/10)+1};changed=true});if(changed)renderList()}).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),matchup=card.querySelector('.list-teams');if(!game||game.sport==='baseball'||!matchup)return;const teams=matchup.querySelectorAll('span'),competition=tableLeagueLabel(game);[game.home,game.away].forEach((name,index)=>{const node=teams[index],context=teamTable[teamTableKey(game.leagueId,name)];if(!node||!context||node.querySelector('.team-table-context'))return;const record=[context.wins,context.draws,context.losses].every(Number.isFinite)?`${context.wins}–${context.draws}–${context.losses}`:'';node.insertAdjacentHTML('beforeend',`<small class="team-table-context">${record}${record&&Number.isFinite(context.rank)?' · ':''}${Number.isFinite(context.rank)?`${ordinal(context.rank)} IN ${competition}`:''}</small>`)});const week=game.raw?.week?.number||game.raw?.competitions?.[0]?.week?.number,label=game.leagueId==='ucl'?'MATCHDAY':game.leagueId==='nfl'?'WEEK':'MATCHWEEK';if(Number.isFinite(Number(week))&&!card.querySelector('.matchweek'))matchup.insertAdjacentHTML('afterend',`<small class="matchweek">${label} ${week}</small>`)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),matchup=card.querySelector('.list-teams');if(!game||game.sport==='baseball'||!matchup||card.querySelector('.matchweek'))return;const season=game.raw?.season?.year,fixtures=games.filter(item=>item.raw?.season?.year===season).sort((a,b)=>a.time-b.time),index=fixtures.indexOf(game),week=game.raw?.week?.number||game.raw?.competitions?.[0]?.week?.number||(index>=0?Math.floor(index/10)+1:null),label=game.leagueId==='ucl'?'MATCHDAY':game.leagueId==='nfl'?'WEEK':'MATCHWEEK';if(Number.isFinite(Number(week)))matchup.insertAdjacentHTML('afterend',`<small class="matchweek">${label} ${week}</small>`)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>{let changed=false;games.forEach(game=>{if(game.venue){game.venue='';changed=true}});if(changed)renderList()}).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('.list-game.future .list-content>small').forEach(row=>{if(/^(Premier League|La Liga)\s*·?\s*$/.test(row.textContent.trim()))row.remove()})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('.team-table-context').forEach(context=>{if(context.dataset.split)return;context.dataset.split='true';const [record='',standing='']=context.textContent.split(' · ');context.innerHTML=`<b>${record}</b><i>${standing}</i>`})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game);if(!game)return;card.querySelectorAll('.list-teams>span').forEach((team,index)=>{const name=index===0?game.home:game.away,context=teamTable[teamTableKey(game.leagueId,name)],display=team.querySelector('.team-table-context');if(!context||!display||display.dataset.standingReady)return;const record=[context.wins,context.draws,context.losses].every(Number.isFinite)?`${context.wins}–${context.draws}–${context.losses}`:display.querySelector('b')?.textContent||'',standing=Number.isFinite(context.rank)?`${ordinal(context.rank)} IN ${tableLeagueLabel(game)}`:'—';display.dataset.standingReady='true';display.innerHTML=`<b>${record}</b><i data-standing="${standing}">${standing}</i>`})})).observe(listShell,{childList:true,subtree:true});
// The original row template includes a visual "v" separator.  Team context now
// owns that space, so remove the separator rather than trying to hide it with CSS.
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game);
  const matchup=card.querySelector('.list-teams');
  if(!game||game.sport==='baseball'||!matchup)return;
  matchup.querySelector(':scope > i')?.remove();
  matchup.querySelectorAll(':scope > span').forEach((team,index)=>{
    const table=teamTable[teamTableKey(game.leagueId,index===0?game.home:game.away)];
    const context=team.querySelector('.team-table-context');
    if(!table||!context)return;
    const wins=Number(table.wins),draws=Number(table.draws),losses=Number(table.losses),rank=Number(table.rank);
    const record=[wins,draws,losses].every(Number.isFinite)?`${wins}–${draws}–${losses}`:'—';
    const standing=Number.isFinite(rank)&&rank>0?`${ordinal(rank)} IN ${tableLeagueLabel(game)}`:tableLeagueLabel(game);
    const signature=`${record}|${standing}`;
    if(context.dataset.signature===signature)return;
    context.dataset.signature=signature;
    context.dataset.split='true';
    context.dataset.standingReady='true';
    context.innerHTML=`<b>${record}</b><i data-standing="${standing}">${standing}</i>`;
  });
})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('.list-date').forEach(header=>{if(header.querySelector('.date-matchweek'))return;let node=header.nextElementSibling;while(node&&!node.matches('.list-game'))node=node.nextElementSibling;const game=node&&games.find(item=>item.id===node.dataset.game);if(game?.sport==='baseball')return;const week=game?.raw?.week?.number||game?.raw?.competitions?.[0]?.week?.number;if(Number.isFinite(Number(week)))header.insertAdjacentHTML('beforeend',`<span class="date-matchweek">MATCHDAY ${week}</span>`)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past').forEach(card=>{const score=card.querySelector(':scope > strong');if(score&&!score.hasAttribute('data-watch-toggle'))score.setAttribute('data-watch-toggle','');const content=card.querySelector('.list-content'),game=games.find(g=>g.id===card.dataset.game);if(!content||!game)return;const matchup=content.querySelector('.list-teams'),mark=matchup?.querySelector(':scope > i');if(mark&&mark.textContent!=='v'){mark.textContent='v';mark.classList.remove('list-final')}if(game.__showLineup&&!content.querySelector('.lineups,.lineup-empty'))content.insertAdjacentHTML('beforeend',rosterMarkup(game));if(game.__showResults&&game.sport!=='baseball'&&!content.querySelector('.tab-final-score'))content.querySelector('.incident-list')?.insertAdjacentHTML('beforebegin',`<div class="tab-final-score"><span>FINAL SCORE</span><strong>${game.homeAbbr||game.home} ${game.homeScore}–${game.awayScore} ${game.awayAbbr||game.away}</strong></div>`);if(content.querySelector('.match-tabs'))return;const tabs=document.createElement('div');tabs.className='match-tabs';tabs.innerHTML=`<button data-results class="${game.__showResults?'active':''}">SPOIL ME</button><button data-lineup class="${game.__showLineup?'active':''}">SHOW LINEUP</button>`;matchup?.after(tabs)})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>{const title=info.querySelector('.result-title'),tabs=info.querySelector('.detail-tabs');if(!title||!tabs)return;const watch=tabs.querySelector('[data-watch]');if(watch)watch.remove();if(!tabs.querySelector('[data-results]'))tabs.insertAdjacentHTML('afterbegin','<button data-results>SPOIL ME</button>');tabs.querySelectorAll('[data-results]').forEach(button=>{if(button.textContent!=='SPOIL ME')button.textContent='SPOIL ME'});if(title.nextElementSibling!==tabs)title.after(tabs)}).observe(info,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past').forEach(card=>{const game=games.find(g=>g.id===card.dataset.game),final=card.querySelector('.tab-final-score');if(!game||!final||final.dataset.enriched)return;final.dataset.enriched='true';const goals=(game.events||[]).filter(event=>event.type==='goal'||event.type==='score'),byTeam=(id,abbr,logo)=>goals.filter(event=>event.teamId===id&&event.scorer).map(event=>`${event.scorer} ${game.sport==='football'&&event.period?`Q${event.period}`:`${event.minute}'`}`).join(' · '),homeScorers=byTeam(game.homeId,game.homeAbbr,game.homeLogo),awayScorers=byTeam(game.awayId,game.awayAbbr,game.awayLogo);final.innerHTML=`<span>FINAL SCORE</span><strong><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} ${game.homeScore}–${game.awayScore} ${game.awayAbbr||game.away}<img src="${game.awayLogo||''}"></strong>${homeScorers||awayScorers?`<div class="goal-scorers">${homeScorers?`<span><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} · ${homeScorers}</span>`:''}${awayScorers?`<span><img src="${game.awayLogo||''}">${game.awayAbbr||game.away} · ${awayScorers}</span>`:''}</div>`:''}`;let home=0,away=0;card.querySelectorAll('.incident.goal,.incident.score').forEach((row,index)=>{if(row.dataset.scoreline)return;const event=goals[index];if(event?.teamId===game.homeId)home++;else if(event?.teamId===game.awayId)away++;const badge=row.querySelector('.incident-badge'),description=row.querySelector('span:last-child');if(badge&&game.sport!=='football'){const mark=document.createElement('span');mark.className='goal-mark';badge.replaceWith(mark);mark.append(badge);mark.insertAdjacentHTML('beforeend',`<small>${home}–${away}</small>`)}if(description&&game.sport!=='football'&&!/^goal/i.test(description.textContent.trim()))description.insertAdjacentHTML('afterbegin','<b class="goal-label">GOAL! </b>');row.dataset.scoreline='true'})})).observe(listShell,{childList:true,subtree:true});
const soccerBallIcon='<svg class="soccer-ball" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m12 7.3 3.1 2.2-1.2 3.65h-3.8L8.9 9.5 12 7.3Z" fill="currentColor"/><path d="m8.9 9.5-3.5 1.1m8.5-1.1 3.6 1.05m-7.3 2.6-2 3.35m5.8-3.35 2 3.35m-7.8 0-1.7 1.65m11.2-1.65 1.75 1.65" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past .tab-final-score').forEach(final=>{
  if(final.dataset.scoreDesign)return;
  const card=final.closest('[data-game]'),game=games.find(item=>item.id===card?.dataset.game),score=final.querySelector(':scope > strong');
  if(!game||!score)return;
  final.dataset.scoreDesign='true';
  const label=final.querySelector(':scope > span');
  if(game.sport==='soccer'&&label)label.innerHTML=`${soccerBallIcon}FINAL SCORE`;
  score.className='final-scoreline';
  score.innerHTML=`<span class="final-club home"><img src="${game.homeLogo||''}" alt=""><b>${game.homeAbbr||game.home}</b></span><strong>${game.homeScore??'—'}–${game.awayScore??'—'}</strong><span class="final-club away"><b>${game.awayAbbr||game.away}</b><img src="${game.awayLogo||''}" alt=""></span>`;
})).observe(listShell,{childList:true,subtree:true});
const rosterFlagCache=JSON.parse(localStorage.getItem('must-watch-player-flags')||'{}'),countryCode={'The Netherlands':'nl',Netherlands:'nl',England:'gb',Scotland:'gb',Wales:'gb','Northern Ireland':'gb',Ireland:'ie',France:'fr',Spain:'es',Portugal:'pt',Brazil:'br',Argentina:'ar',Belgium:'be',Germany:'de',Italy:'it',Denmark:'dk',Sweden:'se',Norway:'no',Finland:'fi',Poland:'pl',Croatia:'hr',Serbia:'rs',Ukraine:'ua','Czech Republic':'cz',Slovakia:'sk',Hungary:'hu',Austria:'at',Switzerland:'ch',Turkey:'tr',Greece:'gr',Romania:'ro',Bulgaria:'bg',Slovenia:'si',Albania:'al',Morocco:'ma',Algeria:'dz',Tunisia:'tn',Egypt:'eg',Senegal:'sn',Ghana:'gh',Nigeria:'ng','Ivory Coast':'ci',Cameroon:'cm',Mali:'ml','South Africa':'za',Japan:'jp','South Korea':'kr',China:'cn',Uruguay:'uy',Colombia:'co',Chile:'cl',Ecuador:'ec',Paraguay:'py',Peru:'pe',Mexico:'mx',Jamaica:'jm',Canada:'ca','United States':'us',Australia:'au','New Zealand':'nz'};
const fifaFlagCode={ENG:'gb',SCO:'gb',WAL:'gb',NIR:'gb',IRL:'ie',FRA:'fr',ESP:'es',POR:'pt',BRA:'br',ARG:'ar',BEL:'be',NED:'nl',GER:'de',ITA:'it',DEN:'dk',SWE:'se',NOR:'no',FIN:'fi',POL:'pl',CRO:'hr',SRB:'rs',UKR:'ua',CZE:'cz',SVK:'sk',HUN:'hu',AUT:'at',SUI:'ch',TUR:'tr',GRE:'gr',MAR:'ma',ALG:'dz',EGY:'eg',SEN:'sn',GHA:'gh',NGA:'ng',CIV:'ci',CMR:'cm',JPN:'jp',KOR:'kr',USA:'us',CAN:'ca',AUS:'au',NZL:'nz',URU:'uy',COL:'co',CHI:'cl',ECU:'ec',MEX:'mx'};
const rosterEntries=roster=>[...new Map([roster.roster,roster.athletes,roster.entries,roster.players,roster.starters,roster.startingXI,roster.substitutes,roster.bench].filter(Array.isArray).flat().filter(Boolean).map((entry,index)=>{const player=entry.athlete||entry;return [String(player.id||player.uid||player.displayName||player.fullName||`unknown-${index}`),entry]})).values()];
function hydrateRosterFlags(g){
 if(g._flagsLoading||g._flagsReady)return;
 g._flagsLoading=true;
 const players=(g.rosters||[]).flatMap(rosterEntries);
 const tasks=players.map(async raw=>{
  const p=raw.athlete||raw,id=p.id||p.uid||p.displayName,name=p.displayName||p.fullName;
  if(!name||p.flag?.href||raw.flag?.href)return;
  const nationality=p.country||raw.country||p.nationality||raw.nationality||p.citizenship||raw.citizenship||p.birthCountry||raw.birthCountry||'',label=typeof nationality==='string'?nationality:nationality.displayName||nationality.name||nationality.fullName||nationality.abbreviation||nationality.code||'',shortCode=typeof nationality==='string'?'':String(nationality.abbreviation||nationality.code||nationality.isoCode||'').toUpperCase(),directCode=countryCode[label]||fifaFlagCode[String(label).toUpperCase()]||fifaFlagCode[shortCode]||(/^[A-Z]{2}$/.test(shortCode)?shortCode.toLowerCase():'');
  if(directCode){p.flag={href:`https://flagcdn.com/24x18/${directCode}.png`,alt:label};rosterFlagCache[id]=directCode;return}
  const saved=rosterFlagCache[id];
  if(saved){p.flag={href:`https://flagcdn.com/24x18/${saved}.png`,alt:saved};return}
  try{
   const response=await fetch(`https://site.web.api.espn.com/apis/common/v3/sports/soccer/${EPLData.leagues[g.leagueId||activeLeague]?.slug||'eng.1'}/athletes/${encodeURIComponent(p.id)}`);
   if(response.ok){const athlete=(await response.json()).athlete;if(athlete?.flag?.href){p.flag=athlete.flag;return}const code=countryCode[athlete?.citizenship]||fifaFlagCode[String(athlete?.citizenship||'').toUpperCase()];if(code){rosterFlagCache[id]=code;p.flag={href:`https://flagcdn.com/24x18/${code}.png`,alt:athlete.citizenship};return}}
   const fallback=await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(name)}`);
   if(!fallback.ok)return;
   const result=await fallback.json(),candidate=(result?.player||[]).find(x=>String(x.strPlayer||'').toLowerCase()===String(name).toLowerCase()),code=candidate&&countryCode[candidate.strNationality];
   if(code){rosterFlagCache[id]=code;p.flag={href:`https://flagcdn.com/24x18/${code}.png`,alt:candidate.strNationality}}
  }catch(error){}
 });
 Promise.all(tasks).finally(()=>{g._flagsReady=true;g._flagsLoading=false;localStorage.setItem('must-watch-player-flags',JSON.stringify(rosterFlagCache));if(g.__showLineup)renderList()});
}
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const g=games.find(x=>x.id===card.dataset.game);if(g?.__showLineup)hydrateRosterFlags(g)})).observe(listShell,{childList:true,subtree:true});
rosterMarkup=function(g){const iso={ENG:'gb',SCO:'gb',WAL:'gb',NIR:'gb',USA:'us',CAN:'ca',AUS:'au',NZ:'nz',IRL:'ie',FRA:'fr',ESP:'es',POR:'pt',BRA:'br',ARG:'ar',BEL:'be',NED:'nl',GER:'de',ITA:'it',DEN:'dk',SWE:'se',NOR:'no',FIN:'fi',POL:'pl',CRO:'hr',SRB:'rs',UKR:'ua',CZE:'cz',SVK:'sk',HUN:'hu',AUT:'at',SUI:'ch',TUR:'tr',GRE:'gr',ROU:'ro',BUL:'bg',SVN:'si',ALB:'al',MAR:'ma',ALG:'dz',TUN:'tn',EGY:'eg',SEN:'sn',GHA:'gh',NGA:'ng',CIV:'ci',CMR:'cm',MLI:'ml',RSA:'za',JPN:'jp',KOR:'kr',CHN:'cn',URU:'uy',COL:'co',CHI:'cl',ECU:'ec',PAR:'py',PER:'pe',MEX:'mx',JAM:'jm'},player=(raw,role)=>{const p=raw.athlete||raw,number=raw.jersey||p.jersey||p.jerseyNumber||'—',position=raw.position?.abbreviation||p.position?.abbreviation||raw.position?.displayName||p.position?.displayName||'—',country=p.flag||raw.flag||p.country||raw.country||p.nationality||raw.nationality||p.citizenship||raw.citizenship||{},label=country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||'',code=String(country.abbreviation||country.code||country.isoCode||country.id||'').toUpperCase(),url=p.flag?.href||raw.flag?.href||country.href||country.logo||(iso[code]?`https://flagcdn.com/24x18/${iso[code]}.png`:''),flag=url?`<img class="lineup-flag" src="${url}" alt="${label||'Country flag'}">`:'<i class="lineup-flag empty" aria-hidden="true"></i>';return `<div class="lineup-player ${role}"><em>${number}</em>${flag}<span title="${p.displayName||p.fullName||'Unknown player'}">${p.displayName||p.fullName||'Unknown player'}</span><small>${position}</small></div>`},groups=(g.rosters||[]).map(r=>{const name=r.team?.abbreviation||r.team?.displayName||'SQUAD',logo=r.team?.logo||r.team?.logos?.[0]?.href||(name===g.homeAbbr?g.homeLogo:name===g.awayAbbr?g.awayLogo:''),all=r.roster||r.athletes||r.entries||r.players||[],starters=r.starters||r.startingXI||all.filter(x=>x.starter===true||x.isStarter===true||x.status?.type==='starter'),subs=r.substitutes||r.bench||all.filter(x=>x.substitute===true||x.isSubstitute===true||x.status?.type==='substitute');return {name,logo,all,starters,subs,hasRoles:starters.length||subs.length}}).filter(x=>x.all.length||x.starters.length||x.subs.length);if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this match.</p>';return `<div class="lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}">`:''}${group.name}</b>${group.hasRoles?`${group.starters.length?`<h4>STARTING XI</h4>${group.starters.map(p=>player(p,'starter')).join('')}`:''}${group.subs.length?`<h4>BENCH</h4>${group.subs.map(p=>player(p,'sub')).join('')}`:''}`:group.all.map(p=>player(p,'squad')).join('')}</section>`).join('')}</div>`};
function incidentTimeline(g){const events=(g.events||[]).filter(e=>['goal','red','yellow','penalty','sub'].includes(e.type)).slice(0,10);return events.map(e=>{const logo=e.teamId&&e.teamId===g.homeId?g.homeLogo:e.teamId&&e.teamId===g.awayId?g.awayLogo:'',icon=e.type==='goal'&&logo?`<img class="incident-badge" src="${logo}" aria-hidden="true">`:`<i class="incident-mark ${e.type}" aria-hidden="true"></i>`,text=e.scorer&&e.text.includes(e.scorer)?e.text.split(e.scorer).join(`<strong class="incident-player">${e.scorer}</strong>`):e.text;return `<div class="incident ${e.type}"><time>${Number.isFinite(e.minute)?`${e.minute}'`:'—'}</time>${icon}<span>${text}</span></div>`}).join('')||'<p>Detailed incidents are not yet available.</p>'}function rosterMarkup(g){const groups=(g.rosters||[]).map(r=>{const name=r.team?.abbreviation||r.team?.displayName||'SQUAD',logo=r.team?.logo||r.team?.logos?.[0]?.href||(name===g.homeAbbr?g.homeLogo:name===g.awayAbbr?g.awayLogo:'');return {name,logo,players:r.roster||r.athletes||r.entries||r.players||[]}}).filter(x=>x.players.length);if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this match.</p>';return `<div class="lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}">`:''}${group.name}</b>${group.players.map(raw=>{const p=raw.athlete||raw,number=raw.jersey||p.jersey||'—',position=raw.position?.abbreviation||p.position?.abbreviation||raw.position?.displayName||p.position?.displayName||'—',flag=p.flag?.href||raw.flag?.href||'',country=p.flag?.alt||raw.flag?.alt||'';return `<div class="lineup-player"><em>${number}</em>${flag?`<img src="${flag}" alt="${country}">`:''}<span>${p.displayName||p.fullName||'Unknown player'}</span><small>${position}</small></div>`}).join('')}</section>`).join('')}</div>`}function openInfo(g,spoilers=false){const s=g.scoreResult||WatchScore.score(g),injuries=(g.injuries||[]).length,teams=spoilers?`<span class="result-team"><img src="${g.homeLogo||''}">${g.homeAbbr||g.home}</span><strong class="result-final">${g.homeScore}–${g.awayScore}</strong><span class="result-team"><img src="${g.awayLogo||''}">${g.awayAbbr||g.away}</span>`:`<span class="result-team"><img src="${g.homeLogo||''}">${g.homeAbbr||g.home}</span><strong class="result-versus">v</strong><span class="result-team"><img src="${g.awayLogo||''}">${g.awayAbbr||g.away}</span>`;info.innerHTML=`<button class="close" aria-label="Close">×</button><span class="eyebrow">${g.completed?'MATCH NOTES':'MATCH PREVIEW'}</span><h2 class="result-title">${teams}</h2>${g.completed?`<div class="info-score">${s?.watchScore??'—'}</div><p>${WatchScore.reasons(g,s||{}).join(' · ')}</p><div class="detail-tabs">${spoilers?'':'<button data-results>SHOW MATCH RESULTS</button>'}<button data-lineup>SHOW LINEUP</button></div>${spoilers?`<div class="incident-list">${incidentTimeline(g)}</div>`:''}<div data-lineup-content></div>`:`<p>${g.league} · ${g.venue}</p><p>${g.time.toLocaleString(undefined,{weekday:'long',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})}</p>${g.rosters?.length?'<p>OFFICIAL SQUAD INFORMATION AVAILABLE</p>':''}${injuries?`<p>${injuries} provider injury / availability update${injuries>1?'s':''}`:''}`}`;info.hidden=false;info.querySelector('.close').onclick=()=>info.hidden=true;info.querySelector('[data-results]')?.addEventListener('click',()=>openInfo(g,true));info.querySelector('[data-lineup]')?.addEventListener('click',e=>{const box=info.querySelector('[data-lineup-content]');box.innerHTML=box.innerHTML?'':rosterMarkup(g);e.currentTarget.textContent=box.innerHTML?'HIDE LINEUP':'SHOW LINEUP'})}
function select(g,s,details){if(details){openInfo(g);return}const enrich=g._enrichRequest||(g._enrichRequest=EPLData.enrich(g).finally(()=>{g._enrichRequest=null}));enrich.then(()=>{const refined=['baseball','football'].includes(g.sport)?g.scoreResult:(g.scoreResult=WatchScore.score(g));g.__watchCalculating=false;if(refined&&(!s||refined.watchScore!==s.watchScore)){plot.reveal(g,refined);requestAnimationFrame(()=>rerenderAtGame(g.id))}}).finally(()=>{g._watchLoading=false})}
function apply(all){localStorage.setItem('must-watch-teams',JSON.stringify([...activeTeams]));plot.setTeamFilter(activeTeams);renderTeams(all);renderRibbon(all);renderList()}function timeAway(g){const m=Math.round((g.time-Date.now())/60000),past=m<0,a=Math.abs(m),value=a<60?`${Math.max(1,a)}M`:a<1440?`${Math.ceil(a/60)}H`:`${Math.ceil(a/1440)}D`;return past?`${value} AGO`:`IN ${value}`}function listRow(g){const revealed=g.completed&&g.__mwRevealed,calculating=g.completed&&g.__watchCalculating,score=g.completed?(revealed?(g.scoreResult?.watchScore??'—'):calculating?'<i class="score-spinner" aria-label="Calculating Watch Index"></i>':'?'):'',components=g.anticipationBreakdown||{},safe=g.completed?(revealed?WatchScore.reasons(g,g.scoreResult||{}).join(' · '):calculating?'CALCULATING WATCH INDEX…':'WATCH SCORE HIDDEN — SELECT THIS CARD TO REVEAL'):`${g.league} · ${g.venue}`,final=g.__showResults?`${g.homeScore}–${g.awayScore}`:'v';return `<article class="list-game ${g.completed?'past':'future'} ${calculating?'score-calculating':''} ${g.__lineupSpoilers?'lineup-spoilers':''}" data-game="${g.id}"><strong aria-hidden="${g.completed?'false':'true'}">${score}</strong><div class="list-content"><div class="list-teams"><span><img src="${g.homeLogo||''}">${g.homeAbbr||g.home}</span><i class="${g.__showResults?'list-final':''}">${final}</i><span><img src="${g.awayLogo||''}">${g.awayAbbr||g.away}</span></div><p>${g.__showResults?`${g.homeAbbr||g.home} ${final} ${g.awayAbbr||g.away}`:`${g.homeAbbr||g.home}  v  ${g.awayAbbr||g.away}`}</p><small>${safe}</small>${!g.completed?`<small>${g.league} · ${g.venue}</small><small>COMPETITIVENESS ${components.competitiveness??'—'} · CONTEXT ${components.tableContext??'—'} · TIMING ${components.seasonTiming??'—'}</small>`:''}${g.__showResults?`<div class="incident-list list-incidents">${incidentTimeline(g)}</div>`:''}</div><div class="list-meta"><b>${timeAway(g)}</b><small>${g.time.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>${revealed&&!g.__showResults?'<button data-results>SHOW MATCH RESULTS</button>':''}</div></article>`}function renderList(){if(!games.length)return;const visible=games.filter(g=>!activeTeams.size||activeTeams.has(g.home)||activeTeams.has(g.away)).sort((a,b)=>a.time-b.time),now=Date.now();let html='',lastDay='',nowPlaced=false;const divider='<div class="list-now" id="list-now"><span>PAST MATCHES <b>↑</b></span><i></i><span><b>↓</b> UPCOMING MATCHES</span></div>';visible.forEach(g=>{if(!nowPlaced&&g.time>=now){html+=divider;nowPlaced=true}const day=g.time.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});if(day!==lastDay){html+=`<h2 class="list-date">${day}</h2>`;lastDay=day}html+=listRow(g)});if(!nowPlaced)html+=divider;listShell.innerHTML=html;listShell.querySelectorAll('[data-game]').forEach(card=>card.onclick=e=>{const g=games.find(x=>x.id===card.dataset.game);if(e.target.closest('[data-results]')){g.__showResults=true;renderList();return}if(g.completed&&!g.__mwRevealed){plot.activate(g);requestAnimationFrame(renderList)}})}function showTeamPreview(t,b){const rows=games.filter(g=>!g.completed&&(g.home===t||g.away===t)).sort((a,b)=>a.time-b.time).slice(0,6).map(g=>`<div class="cluster-row"><b class="cluster-score">${g.anticipation}</b><span class="cluster-fixture"><span class="cluster-badges"><img src="${g.homeLogo||''}"><img src="${g.awayLogo||''}"></span><span>${g.homeAbbr||g.home} v ${g.awayAbbr||g.away}</span></span><em><strong>${timeAway(g)}</strong><small>${g.time.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small></em></div>`).join('');const r=b.getBoundingClientRect();teamPreview.innerHTML=`<div class="hover-card cluster-card"><span class="hover-kicker">${t.toUpperCase()} · UPCOMING</span><div class="cluster-rows">${rows||'<span class="team-empty">No upcoming fixtures in this window.</span>'}</div></div>`;teamPreview.style.left=`${Math.max(185,Math.min(innerWidth-185,r.left+r.width/2))}px`;teamPreview.style.top=`${r.bottom+8}px`;teamPreview.hidden=false}function renderRibbon(all){ribbon.innerHTML=`<button data-all>ALL</button><button data-clear>CLEAR</button>`+all.map(t=>`<button class="ribbon-team ${activeTeams.has(t)?'active':''}" data-team="${t}"><img src="${logos[t]||''}"></button>`).join('');ribbon.querySelector('[data-all]').onclick=()=>{activeTeams=new Set(all);apply(all)};ribbon.querySelector('[data-clear]').onclick=()=>{activeTeams.clear();apply(all)};ribbon.querySelectorAll('[data-team]').forEach(b=>{const show=()=>showTeamPreview(b.dataset.team,b);b.onclick=()=>{const t=b.dataset.team;activeTeams.has(t)?activeTeams.delete(t):activeTeams.add(t);teamPreview.hidden=true;apply(all)};b.onpointerenter=show;b.onpointermove=show;b.onpointerleave=()=>{teamPreview.hidden=true;ribbonLabel.hidden=true}})}function renderTeams(all){const q=search.value.toLowerCase();results.innerHTML=`<div class="team-tools"><button data-all>SELECT ALL</button><button data-clear>CLEAR</button></div>`+all.filter(t=>t.toLowerCase().includes(q)).slice(0,12).map(t=>`<button class="team-choice ${activeTeams.has(t)?'active':''}" data-team="${t}"><img src="${logos[t]||''}"><span>${activeTeams.has(t)?'●':'○'}</span>${t}</button>`).join('');results.querySelector('[data-all]').onclick=()=>{activeTeams=new Set(all);apply(all)};results.querySelector('[data-clear]').onclick=()=>{activeTeams.clear();apply(all)};results.querySelectorAll('[data-team]').forEach(b=>b.onclick=()=>{const t=b.dataset.team;activeTeams.has(t)?activeTeams.delete(t):activeTeams.add(t);apply(all)})}
document.getElementById('now-button').onclick=()=>document.body.classList.contains('view-list')?document.getElementById('list-now')?.scrollIntoView({behavior:'smooth',block:'center'}):plot.recenter();viewToggle.querySelectorAll('button').forEach(b=>b.onclick=()=>{const list=b.dataset.view==='list';document.body.classList.toggle('view-list',list);plotShell.hidden=list;listShell.hidden=!list;viewToggle.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));if(list){renderList();requestAnimationFrame(()=>document.getElementById('list-now')?.scrollIntoView({block:'center'}))}});listShell.addEventListener('click',e=>{const card=e.target.closest('[data-game]'),g=card&&games.find(x=>x.id===card.dataset.game);if(e.target.closest('[data-lineup]')&&g){g.__showLineup=!g.__showLineup;e.stopPropagation();renderList();return}if(g&&g.completed&&g.__mwRevealed&&!e.target.closest('button')&&(g.__showResults||g.__showLineup)){g.__showResults=false;g.__showLineup=false;e.stopPropagation();renderList()}} ,true);new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const g=games.find(x=>x.id===card.dataset.game),meta=card.querySelector('.list-meta');if(g?.__mwRevealed&&meta&&!meta.querySelector('[data-lineup]'))meta.insertAdjacentHTML('beforeend','<button data-lineup>SHOW LINEUP</button>');if(g?.__showLineup){const content=card.querySelector('.list-content');if(content&&!content.querySelector('.lineups,.lineup-empty'))content.insertAdjacentHTML('beforeend',rosterMarkup(g))}})).observe(listShell,{childList:true,subtree:true});document.getElementById('reveal-all').onclick=()=>plot.games.filter(g=>g.completed&&!g.__mwRevealed).forEach(g=>plot.activate(g));
const labelSpoilerButtons=()=>listShell.querySelectorAll('[data-results]').forEach(button=>{if(/show (match )?results/i.test(button.textContent))button.textContent='SPOIL ME'});
new MutationObserver(labelSpoilerButtons).observe(listShell,{childList:true,subtree:true});
labelSpoilerButtons();
const goToNow=()=>document.body.classList.contains('view-list')?document.getElementById('list-now')?.scrollIntoView({behavior:'smooth',block:'center'}):plot?.recenter();
const teamSelector=document.getElementById('team-selector'),teamGallery=document.getElementById('team-gallery'),leagueSelector=document.getElementById('league-selector'),leagueGallery=document.getElementById('league-gallery'),teamStorageKey=league=>`spoil-me-not-team-filter:${league}`,clubSelectionStorageKey='spoil-me-not-team-filter:club-sources',allLeagueSelectionStorageKey='spoil-me-not-team-filter:all-leagues';
// A club can appear in more than one competition. Keep that intent separately
// from the league-specific lists, using a normalized name only for cross-league matching.
const teamIdentity=team=>String(team||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(?:afc|cfc|cf|fc|sc)\b/g,'').replace(/[^a-z0-9]/g,'');
const allLeagueGameKey=(league,team)=>`${league}:${team}`;
const readClubSources=()=>{try{const saved=JSON.parse(localStorage.getItem(clubSelectionStorageKey)||'{}');return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{}}catch(_){return {}}};
const writeClubSources=sources=>localStorage.setItem(clubSelectionStorageKey,JSON.stringify(sources));
const selectedClubKeys=()=>new Set(Object.entries(readClubSources()).filter(([,sources])=>Array.isArray(sources)&&sources.length).map(([key])=>key));
const readAllLeagueSelection=()=>{const raw=localStorage.getItem(allLeagueSelectionStorageKey);if(raw===null)return null;try{const saved=JSON.parse(raw);return Array.isArray(saved)?new Set(saved.map(teamIdentity).filter(Boolean)):null}catch(_){return null}};
const writeAllLeagueSelection=identities=>{if(identities.size)localStorage.setItem(allLeagueSelectionStorageKey,JSON.stringify([...identities]));else localStorage.removeItem(allLeagueSelectionStorageKey)};
const selectedKeysForAllLeagues=identities=>new Set(games.flatMap(game=>[game.home,game.away].filter(team=>!identities.size||identities.has(teamIdentity(team))).map(team=>allLeagueGameKey(game.leagueId,team))));
const setClubSelection=(team,selected)=>{const key=teamIdentity(team);if(!key)return;if(activeLeague!=='all')localStorage.removeItem(allLeagueSelectionStorageKey);const sources=readClubSources(),from=new Set(Array.isArray(sources[key])?sources[key]:[]);if(selected)from.add(activeLeague);else from.delete(activeLeague);if(from.size)sources[key]=[...from];else delete sources[key];writeClubSources(sources)};
const clearClubSelectionsFrom=league=>{if(league!=='all')localStorage.removeItem(allLeagueSelectionStorageKey);const sources=readClubSources();Object.entries(sources).forEach(([key,from])=>{const next=(Array.isArray(from)?from:[]).filter(source=>source!==league);if(next.length)sources[key]=next;else delete sources[key]});writeClubSources(sources)};
const storedTeamsForLeague=(league,teams)=>{let saved=[];try{saved=JSON.parse(localStorage.getItem(teamStorageKey(league))||'[]')}catch(_){}const valid=saved.filter(team=>teams.includes(team)),shared=teams.filter(team=>selectedClubKeys().has(teamIdentity(team)));return new Set(shared.length?(valid.length?[...valid,...shared]:shared):valid)};
const gameIsSelected=game=>activeLeague==='all'?(allLeagueTeamKeys.has(allLeagueGameKey(game.leagueId,game.home))||allLeagueTeamKeys.has(allLeagueGameKey(game.leagueId,game.away))):(!activeTeams.size||activeTeams.has(game.home)||activeTeams.has(game.away));
let ribbonTeams=[];
const allTeamsSelected=teams=>!activeTeams.size||activeTeams.size===teams.length;
const persistTeamSelection=()=>{
  if(activeLeague!=='all'){localStorage.setItem(teamStorageKey(activeLeague),JSON.stringify([...activeTeams]));return}
  const identities=new Set([...activeTeams].map(teamIdentity).filter(Boolean));
  writeAllLeagueSelection(identities);
  allLeagueTeamKeys=selectedKeysForAllLeagues(identities);
  const shared=selectedClubKeys();
  Object.keys(EPLData.leagues).forEach(league=>{
    const teams=[...new Set(games.filter(game=>game.leagueId===league).flatMap(game=>[game.home,game.away]))];
    if(!teams.length)return;
    const selected=teams.filter(team=>activeTeams.has(team)||shared.has(teamIdentity(team)));
    localStorage.setItem(teamStorageKey(league),JSON.stringify(selected.length===teams.length?[]:selected));
  });
};
const applyTeamSelection=(teams,{goNow=false}={})=>{persistTeamSelection();plot?.setTeamFilter(activeTeams);renderRibbon(teams);renderList();if(goNow)requestAnimationFrame(goToNow)};
const allLeagueOption={id:'all',name:'All Leagues',shortName:'ALL'};
const leagueOptions=()=>[allLeagueOption,...Object.values(EPLData.leagues)];
const leagueLabel=league=>({all:'ALL',epl:'EPL',laliga:'La Liga',ucl:'UCL',mlb:'MLB',nfl:'NFL'}[league.id]||league.shortName||league.name);
const leagueName=league=>({all:'All Leagues',epl:'Premier League',laliga:'La Liga',ucl:'Champions League',mlb:'Major League Baseball',nfl:'National Football League'}[league.id]||league.name||leagueLabel(league));
const renderLeagueSelector=()=>{leagueGallery.innerHTML=leagueOptions().map(league=>`<button type="button" class="league-gallery-item ${league.id===activeLeague?'active':''}" data-select-league="${league.id}" aria-pressed="${league.id===activeLeague}">${league.logo?`<img class="league-choice-badge" src="${league.logo}" alt="">`:''}<span>${leagueName(league)}</span><small>${league.id===activeLeague?'SELECTED':'CHOOSE LEAGUE'}</small></button>`).join('')};
const openLeagueSelector=()=>{teamSelector.hidden=true;renderLeagueSelector();leagueSelector.hidden=false};
const closeLeagueSelector=()=>{leagueSelector.hidden=true};
leagueSelector.querySelector('[data-close-leagues]').onclick=closeLeagueSelector;
leagueGallery.addEventListener('click',event=>{const button=event.target.closest('[data-select-league]');if(!button)return;closeLeagueSelector();switchLeague(button.dataset.selectLeague)});
const renderTeamSelector=()=>{const all=ribbonTeams,allSelected=allTeamsSelected(all);teamGallery.innerHTML=all.map(team=>`<button type="button" class="team-gallery-item ${(allSelected||activeTeams.has(team))?'active':''}" data-select-team="${team}" aria-pressed="${allSelected||activeTeams.has(team)}"><img src="${logos[team]||''}" alt=""><span>${team}</span></button>`).join('')};
const openTeamSelector=()=>{leagueSelector.hidden=true;renderTeamSelector();teamSelector.hidden=false};
const closeTeamSelector=()=>{teamSelector.hidden=true};
teamSelector.querySelector('[data-close-selector]').onclick=closeTeamSelector;
teamSelector.querySelector('[data-select-all]').onclick=()=>{if(activeLeague==='all')writeClubSources({});else clearClubSelectionsFrom(activeLeague);activeTeams.clear();renderTeamSelector();applyTeamSelection(ribbonTeams,{goNow:true})};
teamGallery.addEventListener('click',event=>{const button=event.target.closest('[data-select-team]');if(!button)return;const team=button.dataset.selectTeam,all=ribbonTeams;let next;if(allTeamsSelected(all))next=new Set([team]);else{next=new Set(activeTeams);next.has(team)?next.delete(team):next.add(team)}activeTeams=next.size===all.length||next.size===0?new Set():next;setClubSelection(team,activeTeams.has(team));renderTeamSelector();applyTeamSelection(all,{goNow:true})});
renderRibbon=function(all){
  ribbonTeams=all;const allSelected=allTeamsSelected(all),selected=allSelected?[]:all.filter(team=>activeTeams.has(team));
  const shown=selected.slice(0,6),league=activeLeague==='all'?allLeagueOption:EPLData.leagues[activeLeague];
  ribbon.innerHTML=`<div class="team-band-summary"><button type="button" class="league-band-current" data-edit-leagues aria-label="Change league">${league?.logo?`<img class="league-band-logo" src="${league.logo}" alt="">`:''}<span><b>${leagueLabel(league||{})}</b><i>LEAGUE</i></span></button><span class="league-band-divider" aria-hidden="true"></span><div class="team-selection-summary"><span class="team-band-count">${allSelected?'ALL TEAMS':`${selected.length} TEAM${selected.length===1?'':'S'} SELECTED`}</span><div class="team-band-chosen">${shown.map(team=>`<span><img src="${logos[team]||''}" alt="">${team}</span>`).join('')}${selected.length>shown.length?`<span>+${selected.length-shown.length}</span>`:''}</div></div><button type="button" data-edit-teams>EDIT</button></div>`;
  ribbon.querySelector('[data-edit-leagues]').onclick=openLeagueSelector;
  ribbon.querySelector('[data-edit-teams]').onclick=openTeamSelector;
};
// The selection band is re-rendered whenever a filter or live update changes.
// Delegate its two stable actions from the ribbon so they survive every rebuild.
ribbon.addEventListener('click',event=>{
  const leagueButton=event.target.closest('[data-edit-leagues]');
  if(leagueButton){event.preventDefault();openLeagueSelector();return}
  const teamButton=event.target.closest('[data-edit-teams]');
  if(teamButton){event.preventDefault();openTeamSelector()}
});
// Baseball standings are W–L and division-based; do not squeeze them into football's W–D–L context.
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game);if(game?.sport!=='baseball')return;
  card.querySelectorAll('.list-teams>span').forEach((team,index)=>{
    const table=teamTable[teamTableKey(game.leagueId,index===0?game.home:game.away)];if(!table)return;
    const wins=Number(table.wins),losses=Number(table.losses),rank=Number(table.rank);
    const record=[wins,losses].every(Number.isFinite)?`${wins}–${losses}`:'—';
    const standing=Number.isFinite(rank)&&rank>0?`${ordinal(rank)} IN DIV.`:'MLB';
    let context=team.querySelector('.team-table-context');if(!context){team.insertAdjacentHTML('beforeend','<small class="team-table-context"></small>');context=team.querySelector('.team-table-context')}
    const signature=`${record}|${standing}`;if(context.dataset.mlbSignature===signature&&context.textContent.includes(record)&&context.textContent.includes(standing))return;
    context.dataset.mlbSignature=signature;context.dataset.split='true';context.dataset.standingReady='true';context.innerHTML=`<b>${record}</b><i data-standing="${standing}">${standing}</i>`;
  });
})).observe(listShell,{childList:true,subtree:true});
const originalPod=Gameplot.prototype.pod;
const originalCountdown=Gameplot.prototype.countdown;
const originalVisible=Gameplot.prototype.visible;
Gameplot.prototype.visible=function(d){return activeLeague==='all'?d.members.some(gameIsSelected):originalVisible.call(this,d)};
Gameplot.prototype.countdown=function(game){return game.live&&!game.completed?'LIVE':originalCountdown.call(this,game)};
Gameplot.prototype.pod=function(d){
  if(d.cluster)return originalPod.call(this,d);
  const g=d.members[0],liveRing=g.live?'<circle cx="75" cy="36" r="34" fill="none" stroke="#e3e3df" stroke-width="1.5" stroke-dasharray="3 3"/>':'';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="72"><clipPath id="c"><circle cx="75" cy="36" r="30"/></clipPath><g clip-path="url(#c)"><rect x="45" y="6" width="30" height="60" fill="#5a5a57"/><rect x="75" y="6" width="30" height="60" fill="#b8b8b3"/></g><circle cx="75" cy="36" r="30" fill="none" stroke="#f3f3f1" stroke-width="2"/>${liveRing}</svg>`)}`;
};
const originalChrome=Gameplot.prototype.chrome;
Gameplot.prototype.chrome=function(){
  originalChrome.call(this);
  const live=this.games.filter(game=>game.live&&!game.completed),now=new Date(),marker=document.querySelector('#now-line b'),control=document.getElementById('now-button');
  const stamp=now.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  if(marker)marker.innerHTML=`${live.length?'LIVE NOW':'NOW'}<small>${stamp}</small>`;
  if(control){const label=live.length?'LIVE':'NOW';const text=control.querySelector('b');if(text)text.textContent=label;control.setAttribute('aria-label',live.length?'Go to live matches':'Go to now')}
};
// MLB exposes a provisional player pool well before first pitch. Only batting orders
// count as an official baseball lineup, while the soccer feed keeps its existing rule.
const hasOfficialLineup=game=>game.sport==='baseball'?game.lineupAvailable===true:(game.rosters||[]).some(roster=>rosterEntries(roster).length>0);
const decorateCards=()=>listShell.querySelectorAll('[data-game]').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game),content=card.querySelector('.list-content'),matchup=content?.querySelector('.list-teams'),meta=card.querySelector('.list-meta');
  if(!game||!content||!matchup||!meta)return;
  card.classList.toggle('live-game',!!game.live);
  card.classList.toggle('baseball-game',game.sport==='baseball');
  card.classList.toggle('soccer-game',game.sport==='soccer');
  if(game.sport==='baseball'&&!content.querySelector('.mlb-probables')&&!game.live&&!game.completed){
    const away=game.probableAwayPitcher?.fullName||game.probableAwayPitcher?.name||'',home=game.probableHomePitcher?.fullName||game.probableHomePitcher?.name||'';
    const details=away||home?`<div class="mlb-probables"><span>PROBABLE PITCHERS</span><div><b>${away||'TBA'}</b><i>vs</i><b>${home||'TBA'}</b></div></div>`:'<div class="mlb-probables"><span>PROBABLE PITCHERS</span><div><b>TBA</b></div></div>';
    matchup.insertAdjacentHTML('afterend',details);
  }
  // The live state is carried by the glowing stamp; keep the right-side block quiet.
  meta.querySelector('.live-indicator')?.remove();
  if(!game.completed&&!game.live&&hasOfficialLineup(game)&&!meta.querySelector('[data-lineup]'))meta.insertAdjacentHTML('beforeend','<button data-lineup>SHOW LINEUP</button>');
  if(game.live&&!content.querySelector('.live-tabs')){
    matchup.insertAdjacentHTML('afterend',`<div class="match-tabs live-tabs"><button data-live-info class="${game.__showLiveInfo?'active':''}">MATCH INFO</button>${hasOfficialLineup(game)?`<button data-lineup class="${game.__showLineup?'active':''}">LINEUP</button>`:''}</div>`);
  }
  if(game.live&&game.__showLiveInfo&&!content.querySelector('.live-match-info')){const liveEvents=(game.events||[]).filter(event=>String(event.text||'').trim()),goals=liveEvents.filter(event=>['goal','score'].includes(event.type)&&event.scorer),scorers=(teamId,abbr,logo)=>goals.filter(event=>event.teamId===teamId).map(event=>`<b>${event.scorer}</b> ${Number.isFinite(event.minute)?`${event.minute}'`:''}`).join(' · '),homeScorers=scorers(game.homeId,game.homeAbbr,game.homeLogo),awayScorers=scorers(game.awayId,game.awayAbbr,game.awayLogo),timeline=liveEvents.length?incidentTimeline({...game,events:liveEvents}):'<p>Live score and official match events are updating from the match feed.</p>';content.querySelector('.live-tabs')?.insertAdjacentHTML('afterend',`<div class="live-match-info"><div class="tab-final-score"><span>LIVE SCORE · ${game.status||'IN PROGRESS'}</span><strong><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} ${game.homeScore??'—'}–${game.awayScore??'—'} ${game.awayAbbr||game.away}<img src="${game.awayLogo||''}"></strong>${homeScorers||awayScorers?`<div class="goal-scorers">${homeScorers?`<span><img src="${game.homeLogo||''}">${game.homeAbbr||game.home} · ${homeScorers}</span>`:''}${awayScorers?`<span><img src="${game.awayLogo||''}">${game.awayAbbr||game.away} · ${awayScorers}</span>`:''}</div>`:''}</div><div class="incident-list">${timeline}</div></div>`)}
  if(game.live&&game.__showLineup&&!content.querySelector('.lineups,.lineup-empty'))content.insertAdjacentHTML('beforeend',rosterMarkup(game));
});
const divider=listShell.querySelector('#list-now'),firstLive=listShell.querySelector('.live-game');
if(divider&&firstLive&&(divider.compareDocumentPosition(firstLive)&Node.DOCUMENT_POSITION_PRECEDING)){let anchor=firstLive;while(anchor.previousElementSibling?.matches('.list-date'))anchor=anchor.previousElementSibling;anchor.before(divider)}
if(firstLive&&!listShell.querySelector('.live-divider-past')){const original=listShell.querySelector('#list-now'),liveCards=[...listShell.querySelectorAll('.live-game')],first=liveCards[0],last=liveCards[liveCards.length-1];original?.remove();const past=document.createElement('div'),future=document.createElement('div');past.id='list-now';past.className='list-now live-divider-past';past.innerHTML='<span>PAST MATCHES <b>↑</b></span>';future.className='list-now live-divider-future';future.innerHTML='<span><b>↓</b> UPCOMING MATCHES</span>';first.before(past);last.after(future)}
new MutationObserver(decorateCards).observe(listShell,{childList:true,subtree:true});
listShell.addEventListener('click',event=>{const button=event.target.closest('[data-live-info]'),card=event.target.closest('[data-game]');if(!button||!card)return;const game=games.find(item=>item.id===card.dataset.game);if(!game)return;event.preventDefault();event.stopImmediatePropagation();game.__showLiveInfo=!game.__showLiveInfo;game.__showLineup=false;renderList()},true);
listShell.addEventListener('click',event=>{const card=event.target.closest('[data-game]'),game=card&&games.find(item=>item.id===card.dataset.game);if(!game?.live||(!game.__showLineup&&!game.__showLiveInfo)||event.target.closest('button'))return;game.__showLineup=false;game.__showLiveInfo=false;event.preventDefault();event.stopPropagation();renderList()},true);
document.getElementById('now-button').addEventListener('click',event=>{const liveCard=listShell.querySelector('.live-game');if(!liveCard||!document.body.classList.contains('view-list'))return;event.preventDefault();event.stopImmediatePropagation();liveCard.scrollIntoView({behavior:'smooth',block:'center'})},true);
rosterMarkup=function(game){
  const flagFor=raw=>{const player=raw.athlete||raw,country=player.flag||raw.flag||player.country||raw.country||player.nationality||raw.nationality||player.citizenship||raw.citizenship||player.birthCountry||raw.birthCountry||player.birthPlace?.country||{},fifa={ENG:'gb',SCO:'gb',WAL:'gb',NIR:'gb',IRL:'ie',FRA:'fr',ESP:'es',POR:'pt',BRA:'br',ARG:'ar',BEL:'be',NED:'nl',GER:'de',ITA:'it',DEN:'dk',SWE:'se',NOR:'no',FIN:'fi',POL:'pl',CRO:'hr',SRB:'rs',UKR:'ua',CZE:'cz',SVK:'sk',HUN:'hu',AUT:'at',SUI:'ch',TUR:'tr',GRE:'gr',MAR:'ma',ALG:'dz',EGY:'eg',SEN:'sn',GHA:'gh',NGA:'ng',CIV:'ci',CMR:'cm',JPN:'jp',KOR:'kr',USA:'us',CAN:'ca',AUS:'au',NZL:'nz',URU:'uy',COL:'co',CHI:'cl',ECU:'ec',MEX:'mx'};const label=typeof country==='string'?country:country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||'';const rawCode=typeof country==='string'?'':String(country.abbreviation||country.code||country.isoCode||country.id||'').toUpperCase();const code=countryCode[label]||countryCode[rawCode]||fifa[String(label).toUpperCase()]||fifa[rawCode]||(/^[A-Z]{2}$/.test(rawCode)?rawCode.toLowerCase():'');const url=player.flag?.href||raw.flag?.href||country.href||country.logo||(code?`https://flagcdn.com/24x18/${code}.png`:'');return url?`<img class="lineup-flag" src="${url}" alt="${label||'Country flag'}">`:'<i class="lineup-flag empty" aria-label="Nationality unavailable"></i>'};
  const player=(raw,role)=>{const person=raw.athlete||raw,number=raw.jersey||person.jersey||person.jerseyNumber||'—',position=raw.position?.abbreviation||person.position?.abbreviation||raw.position?.displayName||person.position?.displayName||'—',country=person.flag||raw.flag||person.country||raw.country||person.nationality||raw.nationality||person.citizenship||raw.citizenship||person.birthCountry||raw.birthCountry||person.birthPlace?.country||{},countryRaw=typeof country==='string'?country:country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||person.flag?.alt||'Country unavailable',countryNames={ENG:'England',SCO:'Scotland',WAL:'Wales',NIR:'Northern Ireland',IRL:'Ireland',FRA:'France',ESP:'Spain',POR:'Portugal',BRA:'Brazil',ARG:'Argentina',BEL:'Belgium',NED:'Netherlands',GER:'Germany',ITA:'Italy',DEN:'Denmark',SWE:'Sweden',NOR:'Norway',USA:'United States',CAN:'Canada',AUS:'Australia',JPN:'Japan',KOR:'South Korea'},countryName=countryNames[String(countryRaw).toUpperCase()]||countryRaw,name=person.displayName||person.fullName||'Unknown player';return `<div class="lineup-player ${role}" tabindex="0"><em>${number}</em>${flagFor(raw)}<span title="${name}">${name}</span><small>${position}</small><aside class="player-tooltip"><b>${name}</b><span>#${number} · ${position}</span><span>${role==='starter'?'Starting XI':role==='sub'?'Substitute':'Squad'} · ${countryName}</span></aside></div>`};
  const groups=(game.rosters||[]).map(roster=>{const players=rosterEntries(roster),starters=(roster.starters||roster.startingXI||[]).filter(Boolean).length?(roster.starters||roster.startingXI||[]).filter(Boolean):players.filter(player=>player.starter===true||player.isStarter===true||player.status?.type==='starter'),subs=(roster.substitutes||roster.bench||[]).filter(Boolean).length?(roster.substitutes||roster.bench||[]).filter(Boolean):players.filter(player=>player.substitute===true||player.isSubstitute===true||player.status?.type==='substitute');return {name:roster.team?.abbreviation||roster.team?.displayName||'SQUAD',logo:roster.team?.logo||roster.team?.logos?.[0]?.href||'',players,starters,subs}}).filter(group=>group.players.length||group.starters.length||group.subs.length);
  if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this match.</p>';
  return `<div class="lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}">`:''}${group.name}</b>${group.starters.length||group.subs.length?`${group.starters.length?`<h4>STARTING XI</h4>${group.starters.map(entry=>player(entry,'starter')).join('')}`:''}${group.subs.length?`<h4>BENCH</h4>${group.subs.map(entry=>player(entry,'sub')).join('')}`:''}`:group.players.map(entry=>player(entry,'squad')).join('')}</section>`).join('')}</div>`;
};
const rosterMarkupWithBiography=rosterMarkup;
rosterMarkup=function(game){
  const entries=(game.rosters||[]).flatMap(roster=>rosterEntries(roster));
  const normalize=value=>String(value||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const countryMeta={ENG:['England','gb'],GB:['England','gb'],GBR:['England','gb'],ENGLAND:['England','gb'],SCO:['Scotland','gb'],SCOTLAND:['Scotland','gb'],WAL:['Wales','gb'],WALES:['Wales','gb'],NIR:['Northern Ireland','gb'],'NORTHERN IRELAND':['Northern Ireland','gb'],IRL:['Ireland','ie'],IRELAND:['Ireland','ie'],FRA:['France','fr'],FR:['France','fr'],FRANCE:['France','fr'],ESP:['Spain','es'],ES:['Spain','es'],SPAIN:['Spain','es'],POR:['Portugal','pt'],PT:['Portugal','pt'],PORTUGAL:['Portugal','pt'],BRA:['Brazil','br'],BR:['Brazil','br'],BRAZIL:['Brazil','br'],ARG:['Argentina','ar'],AR:['Argentina','ar'],ARGENTINA:['Argentina','ar'],BEL:['Belgium','be'],BE:['Belgium','be'],BELGIUM:['Belgium','be'],NED:['Netherlands','nl'],NL:['Netherlands','nl'],NETHERLANDS:['Netherlands','nl'],GER:['Germany','de'],DE:['Germany','de'],GERMANY:['Germany','de'],ITA:['Italy','it'],IT:['Italy','it'],ITALY:['Italy','it'],DEN:['Denmark','dk'],DK:['Denmark','dk'],DENMARK:['Denmark','dk'],SWE:['Sweden','se'],SE:['Sweden','se'],SWEDEN:['Sweden','se'],NOR:['Norway','no'],NO:['Norway','no'],NORWAY:['Norway','no'],FIN:['Finland','fi'],FI:['Finland','fi'],FINLAND:['Finland','fi'],POL:['Poland','pl'],PL:['Poland','pl'],POLAND:['Poland','pl'],CRO:['Croatia','hr'],HR:['Croatia','hr'],CROATIA:['Croatia','hr'],SRB:['Serbia','rs'],RS:['Serbia','rs'],SERBIA:['Serbia','rs'],UKR:['Ukraine','ua'],UA:['Ukraine','ua'],UKRAINE:['Ukraine','ua'],CZE:['Czech Republic','cz'],CZ:['Czech Republic','cz'],'CZECH REPUBLIC':['Czech Republic','cz'],SVK:['Slovakia','sk'],SK:['Slovakia','sk'],SLOVAKIA:['Slovakia','sk'],HUN:['Hungary','hu'],HU:['Hungary','hu'],HUNGARY:['Hungary','hu'],AUT:['Austria','at'],AT:['Austria','at'],AUSTRIA:['Austria','at'],SUI:['Switzerland','ch'],CH:['Switzerland','ch'],SWITZERLAND:['Switzerland','ch'],TUR:['Turkey','tr'],TR:['Turkey','tr'],TURKEY:['Turkey','tr'],MAR:['Morocco','ma'],MA:['Morocco','ma'],MOROCCO:['Morocco','ma'],ALG:['Algeria','dz'],DZ:['Algeria','dz'],ALGERIA:['Algeria','dz'],EGY:['Egypt','eg'],EG:['Egypt','eg'],EGYPT:['Egypt','eg'],SEN:['Senegal','sn'],SN:['Senegal','sn'],SENEGAL:['Senegal','sn'],GHA:['Ghana','gh'],GH:['Ghana','gh'],GHANA:['Ghana','gh'],NGA:['Nigeria','ng'],NG:['Nigeria','ng'],NIGERIA:['Nigeria','ng'],CIV:['Ivory Coast','ci'],CI:['Ivory Coast','ci'],'IVORY COAST':['Ivory Coast','ci'],CMR:['Cameroon','cm'],CM:['Cameroon','cm'],CAMEROON:['Cameroon','cm'],JPN:['Japan','jp'],JP:['Japan','jp'],JAPAN:['Japan','jp'],KOR:['South Korea','kr'],KR:['South Korea','kr'],'SOUTH KOREA':['South Korea','kr'],USA:['United States','us'],US:['United States','us'],'UNITED STATES':['United States','us'],CAN:['Canada','ca'],CA:['Canada','ca'],CANADA:['Canada','ca'],AUS:['Australia','au'],AU:['Australia','au'],AUSTRALIA:['Australia','au'],NZL:['New Zealand','nz'],NZ:['New Zealand','nz'],'NEW ZEALAND':['New Zealand','nz'],URU:['Uruguay','uy'],UY:['Uruguay','uy'],URUGUAY:['Uruguay','uy'],COL:['Colombia','co'],CO:['Colombia','co'],COLOMBIA:['Colombia','co'],CHI:['Chile','cl'],CL:['Chile','cl'],CHILE:['Chile','cl'],ECU:['Ecuador','ec'],EC:['Ecuador','ec'],ECUADOR:['Ecuador','ec'],MEX:['Mexico','mx'],MX:['Mexico','mx'],MEXICO:['Mexico','mx']};
  Object.assign(countryMeta,{IE:['Ireland','ie'],JAM:['Jamaica','jm'],JM:['Jamaica','jm'],JAMAICA:['Jamaica','jm'],ROU:['Romania','ro'],RO:['Romania','ro'],ROMANIA:['Romania','ro'],BUL:['Bulgaria','bg'],BG:['Bulgaria','bg'],BULGARIA:['Bulgaria','bg'],SVN:['Slovenia','si'],SI:['Slovenia','si'],SLOVENIA:['Slovenia','si'],ALB:['Albania','al'],AL:['Albania','al'],ALBANIA:['Albania','al'],TUN:['Tunisia','tn'],TN:['Tunisia','tn'],TUNISIA:['Tunisia','tn'],MLI:['Mali','ml'],ML:['Mali','ml'],MALI:['Mali','ml'],RSA:['South Africa','za'],ZA:['South Africa','za'],'SOUTH AFRICA':['South Africa','za'],CHN:['China','cn'],CN:['China','cn'],CHINA:['China','cn'],PAR:['Paraguay','py'],PY:['Paraguay','py'],PARAGUAY:['Paraguay','py'],PER:['Peru','pe'],PE:['Peru','pe'],PERU:['Peru','pe'],GRE:['Greece','gr'],GR:['Greece','gr'],GREECE:['Greece','gr']});
  const ageFor=person=>{const direct=Number(person.age);if(Number.isFinite(direct)&&direct>0)return Math.floor(direct);const date=person.birthDate||person.dateOfBirth||person.dateOfBirthMillis;if(!date)return null;const born=new Date(date);if(Number.isNaN(+born))return null;const now=new Date();let age=now.getFullYear()-born.getFullYear();if(now<new Date(now.getFullYear(),born.getMonth(),born.getDate()))age--;return age>0&&age<60?age:null};
  const template=document.createElement('template');template.innerHTML=rosterMarkupWithBiography(game);
  template.content.querySelectorAll('.lineup-player').forEach(row=>{
    const name=row.querySelector('span[title]')?.getAttribute('title')||'';
    const raw=entries.find(entry=>normalize((entry.athlete||entry).displayName||(entry.athlete||entry).fullName)===normalize(name));
    const person=raw?.athlete||raw||{};
    const country=person.country||raw?.country||person.nationality||raw?.nationality||person.citizenship||raw?.citizenship||person.flag||raw?.flag||{};
    const rawCountry=typeof country==='string'?country:country.alt||country.displayName||country.name||country.fullName||country.abbreviation||country.code||'';
    const [displayCountry,flagCode]=countryMeta[String(rawCountry).toUpperCase()]||[rawCountry,''];
    const age=ageFor(person),bio=[displayCountry,age?`${age}`:''].filter(Boolean).join(' · ');
    if(bio)row.querySelector('span[title]')?.insertAdjacentHTML('beforeend',`<i class="lineup-origin">${bio}</i>`);
    const flag=row.querySelector('.lineup-flag');if(flag&&flagCode){flag.src=`https://flagcdn.com/24x18/${flagCode}.png`;flag.alt=displayCountry;}
    row.querySelector('.player-tooltip')?.remove();
  });
  return template.innerHTML;
};
const playerKey=value=>String(value||'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const samePlayer=(a,b)=>{const left=playerKey(a),right=playerKey(b);return !!left&&!!right&&(left===right||left.endsWith(right)||right.endsWith(left))};
const replacementNames=text=>{const match=String(text||'').match(/([^.,]+?)\s+replaces\s+([^.,]+)/i);if(!match)return [];return [match[1].split('.').pop().trim(),match[2].trim()]};
const playerEventMarkup=(game,name)=>{
  const items=(game.events||[]).flatMap(event=>{
    const minute=Number.isFinite(event.minute)?`${event.minute}'`:'';
    if(event.type==='sub'){
      const [inPlayer,outPlayer]=replacementNames(event.text);
      if(samePlayer(name,inPlayer))return [`<i class="player-event sub-in" title="Subbed on ${minute}">↑ ${minute}</i>`];
      if(samePlayer(name,outPlayer))return [`<i class="player-event sub-out" title="Subbed off ${minute}">↓ ${minute}</i>`];
    }
    // A goal belongs only to the scorer.  ESPN’s participant list can also
    // include the assister, so it is deliberately not used for goal markers.
    const named=event.type==='goal'
      ? samePlayer(name,event.scorer)
      : [event.scorer,...(event.players||[])].some(player=>samePlayer(name,player))||String(event.text||'').toLocaleLowerCase().includes(String(name||'').toLocaleLowerCase());
    if(!named)return [];
    const label={goal:'⚽',yellow:'<b class="card-glyph yellow"></b>',red:'<b class="card-glyph red"></b>',injury:'✚'}[event.type];
    return label?[`<i class="player-event ${event.type}" title="${event.type} ${minute}">${label} ${minute}</i>`]:[];
  });
  return items.length?`<span class="player-events">${items.join('')}</span>`:'';
};
incidentTimeline=function(game){
  if(game.sport==='baseball'){
    const scoring=(game.events||[]).filter(event=>event.type==='run');
    return scoring.map(event=>{
      const logo=event.teamId===game.homeId?game.homeLogo:event.teamId===game.awayId?game.awayLogo:'';
      const half=/bottom/i.test(String(event.half||''))?'▼':'▲',inning=Number.isFinite(Number(event.inning))?`${half} ${event.inning}`:'—',score=Number.isFinite(event.homeScore)&&Number.isFinite(event.awayScore)?`${event.homeScore}–${event.awayScore}`:'—';
      return `<div class="incident run"><time>${inning}</time><span class="event-badge run">${logo?`<img src="${logo}" aria-hidden="true">`:''}</span><span class="event-mark">${score}</span><span>${event.text||'Scoring play'}</span></div>`;
    }).join('')||'<p>Detailed scoring plays are not yet available.</p>';
  }
  let home=0,away=0;
  const events=(game.events||[]).filter(event=>['goal','score','red','yellow','penalty','sub','injury'].includes(event.type)).slice().sort((a,b)=>(a.minute??999)-(b.minute??999));
  return events.map(event=>{
    const isScore=event.type==='goal'||event.type==='score';
    if(isScore){
      if(Number.isFinite(event.homeScore)&&Number.isFinite(event.awayScore)){home=event.homeScore;away=event.awayScore}
      else if(event.teamId===game.homeId)home++;else if(event.teamId===game.awayId)away++;
    }
    const logo=event.teamId===game.homeId?game.homeLogo:event.teamId===game.awayId?game.awayLogo:'';
    const marker=isScore?(game.sport==='football'?({TOUCHDOWN:'TD','FIELD GOAL':'FG','EXTRA POINT':'XP',SAFETY:'SF'}[event.scoreLabel]||'SCORE'):game.sport==='soccer'?`<span class="soccer-goal-score">${soccerBallIcon}<small>${home}–${away}</small></span>`:`${home}–${away}`):event.type==='sub'?'↔':event.type==='yellow'?'<b class="card-glyph yellow"></b>':event.type==='red'?'<b class="card-glyph red"></b>':event.type==='injury'?'✚':'P';
    const badge=logo?`<span class="event-badge ${event.type}"><img src="${logo}" aria-hidden="true"></span>`:`<span class="event-badge fallback ${event.type}"></span>`;
    const rawText=event.scorer&&event.text.includes(event.scorer)?event.text.split(event.scorer).join(`<strong class="incident-player">${event.scorer}</strong>`):event.text;
    const label=game.sport==='football'&&event.scoreLabel&&!String(rawText||'').toUpperCase().includes(event.scoreLabel)?`<b class="score-label">${event.scoreLabel}</b> `:'';
    const clock=game.sport==='football'?(event.period?`Q${event.period}${event.clock?` · ${event.clock}`:''}`:event.clock||'—'):(Number.isFinite(event.minute)?`${event.minute}'`:'—');
    return `<div class="incident ${event.type}"><time>${clock}</time>${badge}<span class="event-mark">${marker}</span><span>${label}${rawText||'Scoring play'}</span></div>`;
  }).join('')||'<p>Detailed incidents are not yet available.</p>';
};
new MutationObserver(()=>listShell.querySelectorAll('[data-game] .lineup-player:not([data-events])').forEach(row=>{
  row.dataset.events='true';
  row.removeAttribute('tabindex');
  const game=games.find(item=>item.id===row.closest('[data-game]')?.dataset.game),name=row.querySelector('span[title]')?.getAttribute('title')||row.querySelector('span')?.textContent;
  if(game&&name)row.querySelector('span[title]')?.insertAdjacentHTML('afterend',playerEventMarkup(game,name));
})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>listShell.querySelectorAll('[data-game].past').forEach(card=>{
  const game=games.find(item=>item.id===card.dataset.game),lineups=card.querySelector('.lineups');
  if(!game||!lineups||card.querySelector('.lineup-spoiler-control'))return;
  const control=document.createElement('div');
  control.className='lineup-spoiler-control';
  control.innerHTML=`<span class="spoiler-label">SPOILER?</span><button data-lineup-spoilers role="switch" aria-checked="${!!game.__lineupSpoilers}"><i class="toggle-knob"></i><b>${game.__lineupSpoilers?'ON':'OFF'}</b></button>`;
  const tabs=card.querySelector('.match-tabs');if(tabs)tabs.append(control);else lineups.before(control);
})).observe(listShell,{childList:true,subtree:true});
listShell.addEventListener('click',event=>{
  const button=event.target.closest('[data-lineup-spoilers]'),card=event.target.closest('[data-game]');
  if(!button||!card)return;
  const game=games.find(item=>item.id===card.dataset.game);if(!game)return;
  event.preventDefault();event.stopImmediatePropagation();
  game.__lineupSpoilers=!game.__lineupSpoilers;renderList();
},true);
const rosterMarkupWithProviderBench=rosterMarkup;
rosterMarkup=function(game){
  (game.rosters||[]).forEach(roster=>{
    if((roster.substitutes||roster.bench||[]).length)return;
    const teamId=String(roster.team?.id||(roster.team?.abbreviation===game.homeAbbr?game.homeId:roster.team?.abbreviation===game.awayAbbr?game.awayId:''));
    if(!teamId)return;
    const used=(game.events||[]).filter(event=>event.type==='sub'&&String(event.teamId)===teamId).map(event=>replacementNames(event.text)[0]||event.players?.[0]).filter(Boolean);
    const unique=[...new Map(used.map(name=>[playerKey(name),name])).values()];
    if(unique.length){roster.substitutes=unique.map(name=>({athlete:{displayName:name},substitute:true}));game._flagsReady=false}
  });
  return rosterMarkupWithProviderBench(game);
};
const rosterMarkupWithSportTerms=rosterMarkup;
rosterMarkup=function(game){
  if(game.sport!=='baseball')return rosterMarkupWithSportTerms(game);
  const key=entry=>{const player=entry?.athlete||entry||{};return String(player.id||player.uid||player.displayName||player.fullName||'')};
  const player=(entry,order='')=>{
    const raw=entry?.athlete||entry||{},number=entry?.jersey||raw.jersey||raw.jerseyNumber||'—',position=entry?.position?.abbreviation||raw.position?.abbreviation||entry?.position?.code||raw.position?.code||'—',flag=raw.flag?.href||entry?.flag?.href||'',country=raw.flag?.alt||entry?.flag?.alt||'';
    return `<div class="lineup-player baseball-player"><em>${order||number}</em>${flag?`<img class="lineup-flag" src="${flag}" alt="${country||'Country flag'}">`:'<i class="lineup-flag empty" aria-hidden="true"></i>'}<span title="${raw.displayName||raw.fullName||'Unknown player'}">${raw.displayName||raw.fullName||'Unknown player'}</span><small>${position}</small></div>`;
  };
  const groups=(game.rosters||[]).map(roster=>{
    const all=rosterEntries(roster),pitcher=roster.startingPitcher||all.find(entry=>{const raw=entry?.athlete||entry||{};return (entry?.position?.abbreviation||raw.position?.abbreviation)==='P'&&entry?.substitute!==true}),starterKeys=new Set((roster.starters||[]).map(key)),batters=(roster.starters||[]).filter(entry=>key(entry)!==key(pitcher)).sort((left,right)=>(Number(left?.battingOrder)||99)-(Number(right?.battingOrder)||99)),fallbackBatters=all.filter(entry=>key(entry)!==key(pitcher)&&((entry?.position?.abbreviation||(entry?.athlete||entry)?.position?.abbreviation)!=='P')).slice(0,9),order=batters.length?batters:fallbackBatters,used=new Set([key(pitcher),...order.map(key)]),bench=(roster.substitutes||all.filter(entry=>!starterKeys.has(key(entry)))).filter(entry=>!used.has(key(entry))),name=roster.team?.abbreviation||roster.team?.displayName||'TEAM',logo=roster.team?.logo||roster.team?.logos?.[0]?.href||(name===game.homeAbbr?game.homeLogo:name===game.awayAbbr?game.awayLogo:'');
    return {name,logo,pitcher,order,bench};
  }).filter(group=>group.pitcher||group.order.length||group.bench.length);
  if(!groups.length)return '<p class="lineup-empty">Official lineup data is not available for this game.</p>';
  return `<div class="lineups baseball-lineups">${groups.map(group=>`<section><b>${group.logo?`<img src="${group.logo}" alt="">`:''}${group.name}</b>${group.pitcher?`<h4>STARTING PITCHER</h4>${player(group.pitcher,'P')}`:''}${group.order.length?`<h4>BATTING ORDER</h4>${group.order.map((entry,index)=>player(entry,index+1)).join('')}`:''}${group.bench.length?`<h4>BENCH</h4>${group.bench.map(entry=>player(entry)).join('')}`:''}</section>`).join('')}</div>`;
};
function boxScoreMarkup(game){const teams=game.summary?.boxscore?.teams||game.summary?.boxscore?.teamStats||[],home=teams.find(team=>String(team.team?.id||team.id||'')===String(game.homeId)),away=teams.find(team=>String(team.team?.id||team.id||'')===String(game.awayId)),value=(team,keys)=>{const stat=(team?.statistics||team?.stats||[]).find(item=>keys.includes(String(item.name||item.label||'').toLowerCase().replace(/[^a-z]/g,'')));return stat?.displayValue??stat?.value??''},rows=[['SHOTS',['shots']],['ON TARGET',['shotsontarget','shotsongoal']],['CORNERS',['corners','cornerkicks']],['SAVES',['saves']],['POSSESSION',['possession','possessionpct']]].map(([label,keys])=>({label,home:value(home,keys),away:value(away,keys)})).filter(row=>row.home!==''||row.away!=='');return rows.length?`<section class="box-score" aria-label="Match statistics"><h3>MATCH STATS</h3>${rows.map(row=>`<div><b>${row.home||'—'}</b><span>${row.label}</span><b>${row.away||'—'}</b></div>`).join('')}</section>`:''}
boxScoreMarkup=function(game){const teams=game.summary?.boxscore?.teams||game.summary?.boxscore?.teamStats||[],home=teams.find(team=>String(team.team?.id||team.id||'')===String(game.homeId)),away=teams.find(team=>String(team.team?.id||team.id||'')===String(game.awayId)),value=(team,keys)=>{const stat=(team?.statistics||team?.stats||[]).find(item=>keys.includes(String(item.name||item.label||'').toLowerCase().replace(/[^a-z]/g,'')));return stat?.displayValue??stat?.value??''},number=value=>Number(String(value).replace(/[^\d.]/g,'')),mark=(value,other,color)=>`<b class="${number(value)>number(other)?'stat-lead':''}" ${number(value)>number(other)?`style="--team:${color}"`:''}>${value||'—'}</b>`,rows=[['SHOTS',['shots']],['ON TARGET',['shotsontarget','shotsongoal']],['CORNERS',['corners','cornerkicks']],['SAVES',['saves']],['TOUCHES IN BOX',['touchesinoppositionbox','touchesinoppositionarea','touchesinbox']]].map(([label,keys])=>({label,home:value(home,keys),away:value(away,keys)})).filter(row=>row.home!==''||row.away!==''),homePossession=value(home,['possession','possessionpct']),awayPossession=value(away,['possession','possessionpct']),possession=homePossession!==''||awayPossession!==''?`<div class="box-possession"><span>POSSESSION</span><div><i style="flex:${number(homePossession)||0};background:${game.homeColor}">${homePossession||'—'}</i><i style="flex:${number(awayPossession)||0};background:${game.awayColor}">${awayPossession||'—'}</i></div></div>`:'';return rows.length||possession?`<section class="box-score" aria-label="Match statistics">${rows.map(row=>`<div>${mark(row.home,row.away,game.homeColor)}<span>${row.label}</span>${mark(row.away,row.home,game.awayColor)}</div>`).join('')}${possession}</section>`:''};
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),incidents=card.querySelector('.list-incidents');if(game?.__showResults&&game.sport!=='baseball'&&incidents&&!card.querySelector('.box-score')){const markup=boxScoreMarkup(game);if(markup)incidents.insertAdjacentHTML('beforebegin',markup)}})).observe(listShell,{childList:true,subtree:true});
new MutationObserver(()=>{const title=info.querySelector('.result-title')?.textContent||'',game=games.find(item=>title.includes(item.homeAbbr||item.home)&&title.includes(item.awayAbbr||item.away)),incidents=info.querySelector('.incident-list');if(game&&game.sport!=='baseball'&&incidents&&!info.querySelector('.box-score')){const markup=boxScoreMarkup(game);if(markup)incidents.insertAdjacentHTML('beforebegin',markup)}}).observe(info,{childList:true,subtree:true});
boxScoreMarkup=function(game){
  if(game.sport==='baseball')return '';
  const teams=game.summary?.boxscore?.teams||game.summary?.boxscore?.teamStats||[];
  const home=teams.find(team=>String(team.team?.id||team.id||'')===String(game.homeId));
  const away=teams.find(team=>String(team.team?.id||team.id||'')===String(game.awayId));
  const value=(team,keys)=>{const stat=(team?.statistics||team?.stats||[]).find(item=>keys.includes(String(item.name||item.label||'').toLowerCase().replace(/[^a-z]/g,'')));return stat?.displayValue??stat?.value??''};
  const number=value=>Number(String(value).replace(/[^\d.]/g,''));
  const ink=color=>{const hex=String(color||'').replace('#','');if(!/^[0-9a-f]{6}$/i.test(hex))return '#f3efe5';const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));return (.2126*r+.7152*g+.0722*b)/255>.6?'#11110f':'#f3efe5'};
  const mark=(value,other,color)=>`<b class="${number(value)>number(other)?'stat-lead':''}" ${number(value)>number(other)?`style="--team:${color}"`:''}>${value||'—'}</b>`;
  const metricRows=game.sport==='baseball'?
    [['RUNS',['runs']],['HITS',['hits']],['HOME RUNS',['homeruns']],['STRIKEOUTS',['strikeouts']],['WALKS',['baseonballs']],['ERRORS',['errors']]]:
    [['TOTAL SHOTS',['shots','totalshots','shotstotal']],['ON TARGET',['shotsontarget','shotsongoal']],['CORNERS',['corners','cornerkicks','totalcorners']],['SAVES',['saves','goalkeepersaves']],['TOUCHES IN BOX',['touchesinoppositionbox','touchesinoppositionarea','touchesinthebox','touchesinbox']],['FOULS',['fouls','foulscommitted']],['OFFSIDES',['offsides','offsidescommitted']]];
  const rows=metricRows.map(([label,keys])=>({label,home:value(home,keys),away:value(away,keys)})).filter(row=>row.home!==''||row.away!=='');
  const homePossession=game.sport==='baseball'?'':value(home,['possession','possessionpct','possessionpercentage']),awayPossession=game.sport==='baseball'?'':value(away,['possession','possessionpct','possessionpercentage']);
  const possession=homePossession!==''||awayPossession!==''?`<div class="box-possession"><span>POSSESSION</span><div><i style="flex:${number(homePossession)||0};background:${game.homeColor};color:${ink(game.homeColor)}">${homePossession||'—'}</i><i style="flex:${number(awayPossession)||0};background:${game.awayColor};color:${ink(game.awayColor)}">${awayPossession||'—'}</i></div></div>`:'';
  return rows.length||possession?`<section class="box-score" aria-label="Match statistics">${rows.map(row=>`<div>${mark(row.home,row.away,game.homeColor)}<span>${row.label}</span>${mark(row.away,row.home,game.awayColor)}</div>`).join('')}${possession}</section>`:'';
};
const baseballScorecard=game=>{
  const recap=game.mlbRecap,innings=recap?.innings||[];
  if(!recap&&!Number.isFinite(game.homeScore)&&!Number.isFinite(game.awayScore))return '';
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const displayInnings=Array.from({length:9},(_,index)=>{
    const values=innings.length>9&&index===8?innings.slice(8):innings[index]?[innings[index]]:[];
    return {label:index===8&&innings.length>9?'9+':String(index+1),away:values.length?values.reduce((sum,inning)=>sum+number(inning.away),0):'—',home:values.length?values.reduce((sum,inning)=>sum+number(inning.home),0):'—'};
  });
  const teamCell=(name,abbr,logo)=>`<th scope="row" aria-label="${name}">${logo?`<img src="${logo}" alt="${name}" title="${name}">`:`<span>${abbr}</span>`}</th>`;
  const row=(name,abbr,logo,side,totals)=>`<tr>${teamCell(name,abbr,logo)}${displayInnings.map(inning=>`<td>${inning[side]}</td>`).join('')}<td class="baseball-total">${totals?.runs??'—'}</td><td class="baseball-total">${totals?.hits??'—'}</td><td class="baseball-total">${totals?.errors??'—'}</td></tr>`;
  const decisions=[['W',recap?.winner,recap?.winnerLine],['L',recap?.loser,recap?.loserLine],['SV',recap?.save,recap?.saveLine]].filter(([,name])=>name).map(([label,name,line])=>`<div class="baseball-decision"><b>${label}</b><span><strong>${name}</strong>${line?`<small>${line}</small>`:''}</span></div>`).join('');
  const ordinal=inning=>{const value=Number(inning),tail=value%100;return `${value}${tail>=11&&tail<=13?'th':value%10===1?'st':value%10===2?'nd':value%10===3?'rd':'th'}`};
  const homers=(recap?.homeRuns||[]).map(homeRun=>{const teamId=String(homeRun.teamId||''),home=teamId===String(game.homeId),logo=home?game.homeLogo:game.awayLogo,name=home?game.home:game.away,detail=[homeRun.inning&&`${ordinal(homeRun.inning)} inning`,homeRun.total>1&&`${homeRun.total}-run`,Number.isFinite(homeRun.seasonHomeRuns)&&`${homeRun.seasonHomeRuns} HR this season`].filter(Boolean).join(' · ');return `<li>${logo?`<img src="${logo}" alt="${name}" title="${name}">`:''}<span><strong>${homeRun.batter||'Home run'}</strong>${detail?`<small>${detail}</small>`:''}</span></li>`}).join('');
  const lineScore=`<table class="baseball-linescore" aria-label="Inning-by-inning score"><thead><tr><th scope="col"><span class="sr-only">Team</span></th>${displayInnings.map(inning=>`<th scope="col">${inning.label}</th>`).join('')}<th scope="col">R</th><th scope="col">H</th><th scope="col">E</th></tr></thead><tbody>${row(game.away,game.awayAbbr||game.away,game.awayLogo,'away',recap?.away)}${row(game.home,game.homeAbbr||game.home,game.homeLogo,'home',recap?.home)}</tbody></table>`;
  return `<section class="baseball-scorecard" aria-label="Baseball scorecard">${lineScore}${decisions||homers?`<div class="baseball-recap-meta">${decisions?`<div class="baseball-decisions" aria-label="Pitching decisions">${decisions}</div>`:''}${homers?`<div class="baseball-homers"><b>HOME RUNS</b><ul>${homers}</ul></div>`:''}</div>`:''}</section>`;
};
const footballScorecard=game=>{
  const competitors=game.raw?.competitions?.[0]?.competitors||[],side=id=>competitors.find(item=>String(item.team?.id||item.id||'')===String(id)),home=side(game.homeId),away=side(game.awayId),homeLines=home?.linescores||[],awayLines=away?.linescores||[],length=Math.max(homeLines.length,awayLines.length);
  if(!length)return '';
  const points=line=>line?.displayValue??line?.value??line?.score??'—',row=(abbr,logo,lines,total)=>`<div class="football-line-row"><b>${logo?`<img src="${logo}" alt="">`:''}${abbr}</b>${Array.from({length},(_,index)=>`<i>${points(lines[index])}</i>`).join('')}<strong>${total??'—'}</strong></div>`;
  return `<section class="football-scorecard" aria-label="Football scorecard"><div class="football-line-head"><b>PTS</b>${Array.from({length},(_,index)=>`<i>Q${index+1}</i>`).join('')}<strong>T</strong></div>${row(game.awayAbbr||game.away,game.awayLogo,awayLines,game.awayScore)}${row(game.homeAbbr||game.home,game.homeLogo,homeLines,game.homeScore)}</section>`;
};
const applyStatBadgeContrast=root=>root.querySelectorAll('.stat-lead:not([data-contrast])').forEach(badge=>{const hex=badge.style.getPropertyValue('--team').replace('#','');if(!/^[0-9a-f]{6}$/i.test(hex))return;const [r,g,b]=[0,2,4].map(index=>parseInt(hex.slice(index,index+2),16));const luminance=(.2126*r+.7152*g+.0722*b)/255;badge.style.setProperty('--team-ink',luminance>.6?'#11110f':'#f3efe5');badge.dataset.contrast='true'});
new MutationObserver(()=>{applyStatBadgeContrast(listShell);applyStatBadgeContrast(info)}).observe(document.body,{childList:true,subtree:true});
const stampCountdown=game=>{const minutes=Math.max(0,Math.round((game.time-Date.now())/60000));if(minutes<60)return `${Math.max(1,minutes)}m`;if(minutes<1440)return `${Math.ceil(minutes/60)}h`;return `${Math.ceil(minutes/1440)}d`};
new MutationObserver(()=>listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),stamp=card.querySelector(':scope > strong');if(!game||!stamp)return;card.tabIndex=0;stamp.classList.add('match-stamp');const league=stamp.querySelector('.stamp-league')?.outerHTML||'';if(game.live){stamp.classList.add('live');stamp.dataset.label='';const label=`<span class="live-stamp-label">LIVE</span>${league}`;if(stamp.innerHTML!==label)stamp.innerHTML=label}else if(game.completed){stamp.classList.add('past');stamp.dataset.label='';const meta=card.querySelector('.list-meta small'),markup=cardDateMarkup(game.time);if(meta&&meta.innerHTML!==markup)meta.innerHTML=markup}else{stamp.classList.add('future');stamp.dataset.label='';const label=`<i>IN</i><b>${stampCountdown(game)}</b>${league}`;if(stamp.innerHTML!==label)stamp.innerHTML=label;const meta=card.querySelector('.list-meta small'),markup=cardDateMarkup(game.time);if(meta&&meta.innerHTML!==markup)meta.innerHTML=markup}})).observe(listShell,{childList:true,subtree:true});
const refreshTimeUI=async()=>{
  if(plot){plot.now=new Date();plot.render()}
  await EPLData.refresh(games);
  const live=games.filter(game=>game.live&&!game.completed),upcoming=games.filter(game=>!game.completed&&!game.live&&game.time>Date.now()).sort((a,b)=>a.time-b.time),lineupHorizon=Date.now()+3*60*60*1000,refreshable=[...live,...upcoming.filter(game=>game.sport!=='baseball'||game.time<=lineupHorizon).slice(0,activeLeague==='mlb'?8:30)];
  if(refreshable.length)await Promise.all(refreshable.map(game=>EPLData.enrich(game,{refresh:true})));
  listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game);if(!game)return;card.classList.toggle('live-game',!!game.live);if(!game.live)card.querySelector('.live-indicator')?.remove();if(game.__showLiveInfo)card.querySelector('.live-match-info')?.remove()});
  decorateCards();
  listShell.querySelectorAll('[data-game]').forEach(card=>{const game=games.find(item=>item.id===card.dataset.game),relative=card.querySelector('.list-meta>b');if(game&&relative)relative.textContent=game.live?'IN PROGRESS':timeAway(game)});
  plot?.render();
};
window.setInterval(refreshTimeUI,60*1000);
renderList=function(){
  if(!games.length)return;
  const visible=games.filter(gameIsSelected).sort((a,b)=>a.time-b.time),now=Date.now(),past=visible.filter(game=>!game.live&&game.time<now),live=visible.filter(game=>game.live),future=visible.filter(game=>!game.live&&game.time>=now);
  const dateRows=items=>{let last='';return items.map(game=>{const day=game.time.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'}),heading=day===last?'':`<h2 class="list-date">${day}</h2>`;last=day;return heading+listRow(game)}).join('')};
  const pastMarker='<div class="list-now live-divider-past" id="list-now"><span>PAST MATCHES <b>↑</b></span></div>',futureMarker='<div class="list-now live-divider-future"><span><b>↓</b> UPCOMING MATCHES</span></div>';
  listShell.innerHTML=live.length?`${dateRows(past)}${pastMarker}${dateRows(live)}${futureMarker}${dateRows(future)}`:`${dateRows(past)}${pastMarker}${dateRows(future)}`;
  listShell.querySelectorAll('[data-game]').forEach(card=>card.onclick=event=>{const game=games.find(item=>item.id===card.dataset.game);if(event.target.closest('[data-results]')){game.__showResults=true;renderList();return}if(game.completed&&!game.__mwRevealed){plot.activate(game);requestAnimationFrame(renderList)}});
};
const cardDateMarkup=time=>{
  const date=time.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  const clock=time.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
  return `<span>${date}</span><time>${clock}</time>`;
};
const fitTeamNames=root=>root.querySelectorAll('.team-name').forEach(name=>{
  let size=Number.parseFloat(getComputedStyle(name).fontSize)||20;
  const minimum=13;
  name.style.removeProperty('font-size');
  size=Number.parseFloat(getComputedStyle(name).fontSize)||size;
  while(size>minimum&&name.scrollHeight>name.clientHeight+1){
    size-=.5;
    name.style.setProperty('font-size',`${size}px`,'important');
  }
});
listRow=function(game){
  const revealed=game.completed&&game.__mwRevealed;
  const calculating=game.completed&&game.__watchCalculating;
  const stamp=game.live?'<span class="live-stamp-label">LIVE</span>':game.completed?(revealed?(game.scoreResult?.watchScore??'—'):calculating?'<i class="score-spinner" aria-label="Calculating Spoil Meter"></i>':'?'):'';
  const state=game.live?'live':game.completed?'past':'future';
  const scoreMessage=game.completed?(revealed?WatchScore.reasons(game,game.scoreResult||{}).join(' · '):calculating?'CALCULATING SPOIL METER…':''):'';
  const team=(side,name,logo)=>`<span class="${side}-team"><img src="${logo||''}" alt=""><b class="team-name" title="${name}">${name}</b></span>`;
  const anticipation=game.anticipationBreakdown||{};
  const preview=!game.completed&&!game.live?`<small class="match-preview">COMPETITIVENESS ${anticipation.competitiveness??'—'} · CONTEXT ${anticipation.tableContext??'—'} · TIMING ${anticipation.seasonTiming??'—'}</small>`:'';
  const sportScorecard=game.sport==='baseball'?baseballScorecard(game):game.sport==='football'?footballScorecard(game):'';
  const details=game.__showResults?`${sportScorecard}<div class="incident-list list-incidents">${incidentTimeline(game)}</div>`:'';
  // The competition mark shares the score/countdown stamp in the combined feed.
  // It is a local asset so this cue remains available even if a provider is down.
  const leagueStamp=activeLeague==='all'&&game.leagueLogo
    ?`<span class="stamp-league" title="${game.league||''}" aria-label="${game.league||''}"><img src="${game.leagueLogo}" alt="${game.league||''}"></span>`
    :'';
  return `<article class="list-game ${state} ${game.sport==='football'?'football-game':''} ${game.__showResults?'spoiled':''} ${calculating?'score-calculating':''} ${game.__lineupSpoilers?'lineup-spoilers':''}" data-game="${game.id}"><strong aria-hidden="${game.completed?'false':'true'}">${stamp}${leagueStamp}</strong><div class="list-content"><div class="list-teams">${team('home',game.home,game.homeLogo)}${team('away',game.away,game.awayLogo)}</div>${scoreMessage?`<small class="score-message">${scoreMessage}</small>`:''}${preview}${details}</div><div class="list-meta"><b>${game.live?'IN PROGRESS':timeAway(game)}</b><small class="match-datetime">${cardDateMarkup(game.time)}</small>${revealed&&!game.__showResults?'<button data-results>SPOIL ME</button>':''}</div></article>`;
};
const renderListWithResponsiveNames=renderList;
renderList=function(){
  renderListWithResponsiveNames();
  requestAnimationFrame(()=>fitTeamNames(listShell));
};
const drawResponsiveList=renderList;
renderList=function(){
  const lock=listPositionLock&&listPositionLock.until>Date.now()?listPositionLock:null;
  drawResponsiveList();
  if(!lock)return;
  const holdPosition=()=>{
    const card=[...listShell.querySelectorAll('[data-game]')].find(node=>node.dataset.game===lock.id);
    if(!card)return;
    const drift=card.getBoundingClientRect().top-lock.top;
    if(Math.abs(drift)>.5)listShell.scrollTop=Math.max(0,listShell.scrollTop+drift);
  };
  requestAnimationFrame(()=>{holdPosition();requestAnimationFrame(holdPosition)});
};
window.addEventListener('resize',()=>requestAnimationFrame(()=>fitTeamNames(listShell)),{passive:true});
function prefetchCompleted(matches){const all=matches.filter(game=>game.completed&&!game._enriched).sort((a,b)=>b.time-a.time),queue=all.some(game=>game.sport==='baseball')?all.slice(0,18):all;let next=0;const worker=()=>{const game=queue[next++];if(!game)return;(game._enrichRequest||(game._enrichRequest=EPLData.enrich(game).finally(()=>{game._enrichRequest=null}))).then(()=>{if(game.completed&&!['baseball','football'].includes(game.sport))game.scoreResult=WatchScore.score(game)}).catch(()=>{}).finally(worker)};Array.from({length:3},worker)}
function prepareGames(loaded){
  games=loaded;logos={};games.forEach(game=>{game.anticipation=Anticipation.score(game);game.anticipationBreakdown=Anticipation.breakdown(game);game.displayScore=50;logos[game.home]=game.homeLogo;logos[game.away]=game.awayLogo});
  const all=[...new Set(games.flatMap(game=>[game.home,game.away]))].sort();
  try{
    if(activeLeague==='all'){
      // An explicit All Leagues choice wins. Its identities survive changing
      // fixture windows, unlike an old snapshot of game ids.
      const explicit=readAllLeagueSelection();
      if(explicit){
        allLeagueTeamKeys=selectedKeysForAllLeagues(explicit);
      }else{
        // Backward-compatible fallback: if any individual league has a
        // specific team choice, All Leagues is the union of those choices.
        // Only when no choices exist at all do we default to every team.
        const chosen=new Set(selectedClubKeys());
        Object.keys(EPLData.leagues).forEach(leagueId=>{
          const leagueTeams=[...new Set(games.filter(game=>game.leagueId===leagueId).flatMap(game=>[game.home,game.away]))];
          let saved=[];
          try{saved=JSON.parse(localStorage.getItem(teamStorageKey(leagueId))||'[]')}catch(_){}
          saved.filter(team=>leagueTeams.includes(team)).forEach(team=>chosen.add(teamIdentity(team)));
        });
        allLeagueTeamKeys=selectedKeysForAllLeagues(chosen);
      }
      activeTeams=new Set();
      games.forEach(game=>[game.home,game.away].forEach(team=>{
        if(allLeagueTeamKeys.has(allLeagueGameKey(game.leagueId,team)))activeTeams.add(team);
      }));
    }else{
      allLeagueTeamKeys=new Set();
      activeTeams=storedTeamsForLeague(activeLeague,all);
    }
  }catch(_){activeTeams=new Set()}
  return all;
}
function renderLeagueSwitcher(){leagueSwitcher.innerHTML=leagueOptions().map(league=>`<button type="button" data-league="${league.id}" class="${league.id===activeLeague?'active':''}">${leagueLabel(league)}</button>`).join('')}
leagueSwitcher.addEventListener('click',event=>{const button=event.target.closest('[data-league]');if(!button)return;event.preventDefault();switchLeague(button.dataset.league)});
const lineupCandidates=source=>{const horizon=Date.now()+3*60*60*1000;return source.filter(game=>game.live||(!game.completed&&game.time>Date.now()&&(game.sport!=='baseball'||game.time<=horizon))).sort((a,b)=>a.time-b.time).slice(0,activeLeague==='mlb'?12:activeLeague==='all'?40:100)};
async function switchLeague(id){if(id===activeLeague&&games.length)return;const league=id==='all'?allLeagueOption:EPLData.leagues[id];if(!league)return;const serial=(switchLeague.serial||0)+1;switchLeague.serial=serial;document.body.classList.add('league-switching');info.hidden=true;try{EPLData.setLeague(id);const loaded=await EPLData.load(id);if(serial!==switchLeague.serial)return;activeLeague=id;const all=prepareGames(loaded);if(plot){plot.games=games;plot.now=new Date();plot.setTeamFilter(activeTeams);plot.recenter()}renderLeagueSwitcher();renderRibbon(all);renderList();loadTeamTable(id);requestAnimationFrame(()=>{document.getElementById('list-now')?.scrollIntoView({block:'center'});const warm=()=>prefetchCompleted(games);window.requestIdleCallback?window.requestIdleCallback(warm,{timeout:1200}):setTimeout(warm,250)});Promise.all(lineupCandidates(games).map(game=>EPLData.enrich(game))).finally(()=>{if(serial===switchLeague.serial){renderList();decorateCards();refreshTimeUI()}})}catch(error){const box=document.getElementById('error');box.textContent=`LIVE DATA UNAVAILABLE — ${error.message}`;box.hidden=false}finally{if(serial===switchLeague.serial)document.body.classList.remove('league-switching')}}
window.addEventListener('spoil-me-not:choose-league',event=>{const id=event.detail?.id;if(id)switchLeague(id)});
const meterRevealControl=document.getElementById('reveal-all'),meterRevealWrap=document.createElement('div');
leagueSwitcher.hidden=true;meterRevealWrap.className='meter-reveal-control';meterRevealWrap.innerHTML='<span>SPOIL METERS?</span>';meterRevealWrap.append(meterRevealControl);document.querySelector('.masthead-actions')?.insertBefore(meterRevealWrap,document.getElementById('now-button'));
const syncMeterRevealControl=()=>{const completed=games.filter(game=>game.completed),allRevealed=completed.length>0&&completed.every(game=>game.__mwRevealed),label=allRevealed?'HIDE ALL':'SHOW ALL',icon=allRevealed?String(completed.length):'?';meterRevealControl.innerHTML=`<i class="meter-all-icon" aria-hidden="true">${icon}</i><b>${label}</b>`;meterRevealControl.setAttribute('role','switch');meterRevealControl.setAttribute('aria-checked',String(allRevealed));meterRevealControl.setAttribute('aria-label',allRevealed?'Hide all Spoil Meters':'Reveal all Spoil Meters');meterRevealControl.title=meterRevealControl.getAttribute('aria-label')};
syncMeterRevealControl();
const enrichForReveal=async completed=>{let cursor=0;const worker=async()=>{while(cursor<completed.length){const game=completed[cursor++];if(!game._enriched)await EPLData.enrich(game).catch(()=>game)}};await Promise.all(Array.from({length:3},worker))};
meterRevealControl.onclick=async event=>{event.preventDefault();event.stopImmediatePropagation();const completed=games.filter(game=>game.completed),allRevealed=completed.length>0&&completed.every(game=>game.__mwRevealed);if(allRevealed){completed.forEach(game=>{game.__mwRevealed=false;game.displayScore=50});plot?.render();renderList();syncMeterRevealControl();return}meterRevealControl.disabled=true;await enrichForReveal(completed);completed.forEach(game=>{const score=game.scoreResult||(['baseball','football'].includes(game.sport)?null:WatchScore.score(game));if(score){game.scoreResult=score;plot?.reveal(game,score)}});renderList();meterRevealControl.disabled=false;syncMeterRevealControl()};
new MutationObserver(syncMeterRevealControl).observe(listShell,{childList:true,subtree:true});
async function boot(){try{EPLData.setLeague(activeLeague);const all=prepareGames(await EPLData.load(activeLeague));document.getElementById('loading').hidden=true;plot=new Gameplot({games,onSelect:select});plot.setTeamFilter(activeTeams);renderLeagueSwitcher();renderRibbon(all);renderList();loadTeamTable(activeLeague);document.body.classList.add('view-list');plotShell.hidden=true;listShell.hidden=false;requestAnimationFrame(()=>{document.getElementById('list-now')?.scrollIntoView({block:'center'});const warm=()=>prefetchCompleted(games);window.requestIdleCallback?window.requestIdleCallback(warm,{timeout:1200}):setTimeout(warm,350)});search.oninput=()=>renderTeams(all);search.onfocus=()=>renderTeams(all);Promise.all(lineupCandidates(games).map(game=>EPLData.enrich(game))).finally(()=>{renderList();decorateCards();refreshTimeUI()})}catch(error){document.getElementById('loading').hidden=true;const box=document.getElementById('error');box.textContent=`LIVE DATA UNAVAILABLE — ${error.message}`;box.hidden=false}}boot()})();
