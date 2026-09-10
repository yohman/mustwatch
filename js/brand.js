(() => {
  const categories = [
    [80, 'Must Watch', 4],
    [65, 'Worth It', 3],
    [45, 'Your Call', 2],
    [25, 'Save Your 90', 1],
    [0, "Don't Bother", 0]
  ];

  const categoryFor = score => categories.find(([minimum]) => score >= minimum) || categories.at(-1);

  const applySpoilMeter = root => {
    root.querySelectorAll('.match-stamp.past').forEach(stamp => {
      const value = Number(stamp.textContent.trim());
      if (Number.isFinite(value) && value >= 0 && value <= 100) {
        const [, label, band] = categoryFor(value);
        const lightness = 7 + 86 * Math.pow(value / 100, 1.25);
        stamp.classList.add('spoil-meter-badge');
        stamp.classList.remove('spoil-meter-trigger');
        stamp.dataset.spoilCategory = label;
        stamp.dataset.meterBand = band;
        stamp.style.setProperty('--meter-tone', `hsl(0 0% ${lightness}%)`);
        stamp.style.setProperty('--meter-ink', lightness > 58 ? '#111' : '#f3f3f1');
        if (!stamp.querySelector('.spoil-meter-value')) {
          stamp.innerHTML = `<button type="button" class="spoil-meter-value" data-watch-toggle aria-label="Toggle Spoil Meter">${value}</button>`;
        }
      } else if (stamp.textContent.trim() === '?') {
        stamp.classList.add('spoil-meter-badge', 'spoil-meter-trigger');
        stamp.dataset.spoilCategory = 'SPOIL METER';
        delete stamp.dataset.meterBand;
        stamp.style.removeProperty('--meter-tone');
        stamp.style.removeProperty('--meter-ink');
        if (!stamp.querySelector('.spoil-meter-value')) {
          stamp.innerHTML = '<button type="button" class="spoil-meter-value" data-watch-toggle aria-label="Toggle Spoil Meter">?</button>';
        }
      }
    });
  };

  const rebrandText = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement?.closest('script,style')) return;
      node.nodeValue = node.nodeValue
        .replace(/Must Watch/g, 'Spoil Me Not')
        .replace(/WATCH SCORE/gi, 'SPOIL METER')
        .replace(/WATCH INDEX/gi, 'SPOIL METER');
    });
  };

  const promoteResultDetails = root => {
    root.querySelectorAll('.list-game').forEach(card => {
      const content = card.querySelector(':scope > .list-content');
      if (!content) return;
      const details = [...content.querySelectorAll(':scope > .tab-final-score, :scope > .box-score, :scope > .incident-list')];
      if (details.length) content.after(...details);
    });
  };

  const refresh = () => {
    rebrandText(document.body);
    applySpoilMeter(document);
    promoteResultDetails(document);
  };

  const modal = document.getElementById('spoil-meter-modal');
  const modalVersionKey = 'league-choice-introduced-v1';
  const dismiss = () => {
    modal?.setAttribute('hidden', '');
    sessionStorage.setItem(modalVersionKey, 'true');
  };
  modal?.querySelector('[data-dismiss-spoil-meter]')?.addEventListener('click', dismiss);
  modal?.addEventListener('click', event => {
    const choice = event.target.closest('[data-choose-league]');
    if (!choice) return;
    window.dispatchEvent(new CustomEvent('spoil-me-not:choose-league', { detail: { id: choice.dataset.chooseLeague } }));
    dismiss();
  });
  if (sessionStorage.getItem(modalVersionKey) === 'true') dismiss();

  refresh();
  new MutationObserver(refresh).observe(document.body, {childList: true, subtree: true});
})();
