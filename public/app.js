let M = null;
let analyzeTimestamp = 0;
let liveInterval = null;
let rawData = null; // stored for re-render on timer expiry

async function init() {
  try {
    M = await fetch('data/mappings.json').then(r => r.json());
  } catch (e) {
    console.error('Failed to load mappings.json:', e);
  }
  document.getElementById('analyze-btn').addEventListener('click', analyze);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
}

function elapsedSec() {
  return analyzeTimestamp ? Math.floor((Date.now() - analyzeTimestamp) / 1000) : 0;
}

function effectiveTimer(rawSec) {
  return Math.max(0, rawSec - elapsedSec());
}

function resolve(section, id) {
  const key = String(id);
  const entry = M?.[section]?.[key];
  return entry?.name || `Unknown (${id})`;
}

function formatTimer(sec) {
  if (!sec || sec <= 0) return 'Done';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timerClass(sec) {
  if (sec <= 0)    return 'done';
  if (sec < 3600)  return 'urgent';
  if (sec < 86400) return 'soon';
  return 'normal';
}

// ── Parser ──────────────────────────────────────────────

function parse(data) {
  const thEntry = (data.buildings || []).find(b => b.data === 1000001);
  const thLevel = thEntry?.lvl ?? '?';

  // 6th builder: both B.O.B. (28000003) and O.T.T.O. (28000005) must be lvl 30+
  const h2 = data.heroes2 || [];
  const hasBOB  = h2.some(h => h.data === 28000003 && h.lvl >= 30);
  const hasOTTO = h2.some(h => h.data === 28000005 && h.lvl >= 30);
  const totalBuilders = 5 + (hasBOB && hasOTTO ? 1 : 0);

  // Active upgrades — only include those not yet expired
  const upgrades = [];

  (data.buildings || []).forEach(b => {
    if (b.timer && effectiveTimer(b.timer) > 0) upgrades.push({
      type: 'builder',
      name: resolve('buildings', b.data),
      level: b.lvl,
      timer: b.timer,
    });
  });

  (data.units || []).forEach(u => {
    if (u.timer && effectiveTimer(u.timer) > 0) upgrades.push({
      type: 'lab',
      name: resolve('units', u.data),
      level: u.lvl,
      timer: u.timer,
    });
  });

  (data.spells || []).forEach(s => {
    if (s.timer && effectiveTimer(s.timer) > 0) upgrades.push({
      type: 'lab',
      name: resolve('spells', s.data),
      level: s.lvl,
      timer: s.timer,
    });
  });

  (data.heroes || []).forEach(h => {
    if (h.timer && effectiveTimer(h.timer) > 0) upgrades.push({
      type: 'hero',
      name: resolve('heroes', h.data),
      level: h.lvl,
      timer: h.timer,
    });
  });

  (data.pets || []).forEach(p => {
    if (p.timer && effectiveTimer(p.timer) > 0) upgrades.push({
      type: 'pet',
      name: resolve('pets', p.data),
      level: p.lvl,
      timer: p.timer,
    });
  });

  upgrades.sort((a, b) => a.timer - b.timer);

  // Heroes use a builder slot while upgrading
  const busyBuilders = upgrades.filter(u => u.type === 'builder' || u.type === 'hero').length;
  const labBusy = upgrades.some(u => u.type === 'lab');

  // Aggregate home village buildings only (skip BB)
  const bldMap = new Map();
  (data.buildings || []).forEach(b => {
    if (!bldMap.has(b.data)) {
      bldMap.set(b.data, {
        id: b.data,
        name: resolve('buildings', b.data),
        category: M?.buildings?.[String(b.data)]?.category || 'special',
        levels: new Map(),
        upgrading: false,
      });
    }
    const entry = bldMap.get(b.data);
    const cnt = b.cnt ?? 1;
    if (!b.timer || effectiveTimer(b.timer) <= 0) {
      entry.levels.set(b.lvl, (entry.levels.get(b.lvl) || 0) + cnt);
    } else {
      entry.upgrading = true;
      entry.levels.set(b.lvl, (entry.levels.get(b.lvl) || 0) + 1);
    }
  });

  return {
    tag: data.tag || '?',
    thLevel,
    totalBuilders,
    busyBuilders,
    freeBuilders: Math.max(0, totalBuilders - busyBuilders),
    hasBOB,
    hasOTTO,
    labBusy,
    upgrades,
    buildings: [...bldMap.values()],
    heroes:    data.heroes || [],
    pets:      data.pets || [],
    units:     data.units || [],
    spells:    data.spells || [],
    siegeMachines: data.siege_machines || [],
    equipment: data.equipment || [],
  };
}

// ── Render helpers ────────────────────────────────────────

function levelRange(levelsMap) {
  if (!levelsMap.size) return '?';
  const lvls = [...levelsMap.keys()].sort((a, b) => a - b);
  if (lvls.length === 1) return `Lv ${lvls[0]}`;
  return `Lv ${lvls[0]}–${lvls[lvls.length - 1]}`;
}

function totalCount(levelsMap) {
  let n = 0;
  levelsMap.forEach(c => n += c);
  return n;
}

function upgradeIcon(type) {
  const icons = { builder: '🔨', lab: '⚗️', hero: '⚔️', pet: '🐾' };
  return icons[type] || '🔧';
}

function section(_id, title, countLabel, bodyHtml, collapsed = false) {
  return `
  <div class="section">
    <div class="section-header${collapsed ? ' collapsed' : ''}" onclick="toggleSection(this)">
      <h2>${title}</h2>
      ${countLabel ? `<span class="count">${countLabel}</span>` : ''}
      <span class="chevron">▾</span>
    </div>
    <div class="section-body${collapsed ? ' hidden' : ''}">
      ${bodyHtml}
    </div>
  </div>`;
}

// ── Render full result ────────────────────────────────────

function render(d) {
  const parts = [];

  // ── Account bar
  const bobTag = (d.hasBOB && d.hasOTTO)
    ? `<span class="stat"><span class="label">6th Builder</span><span class="value ok">✓ Active</span></span>`
    : `<span class="stat"><span class="label">6th Builder</span><span class="value warn">✗ Locked</span></span>`;
  const labTag = d.labBusy
    ? `<span class="stat"><span class="label">Lab</span><span class="value warn">Busy</span></span>`
    : `<span class="stat"><span class="label">Lab</span><span class="value ok">Free</span></span>`;
  const bFree = d.freeBuilders;
  const bFreeClass = bFree === 0 ? 'bad' : bFree === 1 ? 'warn' : 'ok';

  parts.push(`
  <div class="account-bar">
    <span class="tag">${d.tag}</span>
    <span class="stat"><span class="label">Town Hall</span><span class="value">${d.thLevel}</span></span>
    <span class="stat">
      <span class="label">Builders</span>
      <span class="value ${bFreeClass}">${bFree} free / ${d.totalBuilders}</span>
    </span>
    ${labTag}
    ${bobTag}
  </div>`);

  // ── Active upgrades
  if (d.upgrades.length > 0) {
    const rows = d.upgrades.map(u => {
      const eff = effectiveTimer(u.timer);
      return `
      <div class="upgrade-row ${u.type}">
        <span class="icon">${upgradeIcon(u.type)}</span>
        <span class="name">${u.name}</span>
        <span class="level">→ Lv ${u.level}</span>
        <span class="timer ${timerClass(eff)}" data-timer="${u.timer}">${formatTimer(eff)}</span>
      </div>`;
    }).join('');
    parts.push(section('upgrades', '⏱ Active Upgrades', `${d.upgrades.length}`,
      `<div class="upgrade-list">${rows}</div>`
    ));
  }

  // ── Heroes
  const heroRows = d.heroes.map(h => {
    const name = resolve('heroes', h.data);
    const eff  = h.timer ? effectiveTimer(h.timer) : 0;
    const timer = h.timer ? `<div class="hero-timer" data-timer="${h.timer}">⬆ ${formatTimer(eff)} remaining</div>` : '';
    return `
    <div class="hero-card">
      <div class="hero-name">${name}</div>
      <div class="hero-level">${h.lvl}</div>
      ${timer}
    </div>`;
  });
  if (heroRows.length > 0) {
    parts.push(section('heroes', '⚔️ Heroes', null,
      `<div class="hero-grid">${heroRows.join('')}</div>`
    ));
  }

  // ── Pets
  if (d.pets.length > 0) {
    const petRows = d.pets.map(p => {
      const name = resolve('pets', p.data);
      const eff  = p.timer ? effectiveTimer(p.timer) : 0;
      const timer = p.timer ? `<div class="ptimer" data-timer="${p.timer}">⬆ ${formatTimer(eff)}</div>` : '';
      return `<div class="pet-row"><span class="pname">${name}</span><div style="text-align:right"><span class="plevel">Lv ${p.lvl}</span>${timer}</div></div>`;
    }).join('');
    parts.push(section('pets', '🐾 Pets', null, `<div class="pet-grid">${petRows}</div>`));
  }

  // ── Equipment (grouped by hero)
  if (d.equipment.length > 0) {
    const grouped = {};
    d.equipment.forEach(e => {
      const info = M?.equipment?.[String(e.data)];
      const hero = info?.hero || 'Other';
      if (!grouped[hero]) grouped[hero] = [];
      grouped[hero].push({ ...e, info });
    });
    let equipHtml = '';
    for (const [hero, items] of Object.entries(grouped)) {
      equipHtml += `<div class="bb-label" style="margin-top:10px;margin-bottom:4px;color:var(--gold)">${hero}</div>
      <div class="equip-grid">`;
      equipHtml += items.map(e => {
        const name = e.info?.name || `Unknown (${e.data})`;
        const epic = e.info?.rarity === 'epic' ? ' epic' : '';
        return `<div class="equip-row${epic}"><span class="ename">${name}</span><span class="elevel">Lv ${e.lvl}</span></div>`;
      }).join('');
      equipHtml += '</div>';
    }
    parts.push(section('equipment', '🛡️ Equipment', null, equipHtml, true));
  }

  // ── Army buildings
  const armyCats = ['army', 'special'];
  const armyBlds = d.buildings.filter(b => armyCats.includes(b.category) && b.id !== 1000001 && b.id !== 1000010);
  if (armyBlds.length > 0) {
    const rows = armyBlds.map(b => buildingRow(b)).join('');
    parts.push(section('army-blds', '⚔️ Army Buildings', armyBlds.length, `<div class="building-grid">${rows}</div>`, false));
  }

  // ── Resource buildings
  const resBlds = d.buildings.filter(b => b.category === 'resources');
  if (resBlds.length > 0) {
    const rows = resBlds.map(b => buildingRow(b)).join('');
    parts.push(section('res-blds', '💰 Resource Buildings', resBlds.length, `<div class="building-grid">${rows}</div>`, true));
  }

  // ── Defense buildings
  const defBlds = d.buildings.filter(b => b.category === 'defense' && b.id !== 1000010);
  if (defBlds.length > 0) {
    const rows = defBlds.map(b => buildingRow(b)).join('');
    parts.push(section('def-blds', '🛡️ Defense Buildings', defBlds.length, `<div class="building-grid">${rows}</div>`, true));
  }

  // ── Walls
  const wallEntry = d.buildings.find(b => b.id === 1000010);
  if (wallEntry) {
    const wallLvls = [...wallEntry.levels.entries()].sort((a, b) => a[0] - b[0]);
    let wallHtml = '<div class="building-grid">';
    wallLvls.forEach(([lvl, cnt]) => {
      wallHtml += `<div class="building-row"><span class="bname">Wall Lv ${lvl}</span><span class="blevel">${cnt}×</span></div>`;
    });
    wallHtml += '</div>';
    parts.push(section('walls', '🧱 Walls', totalCount(wallEntry.levels), wallHtml, true));
  }

  // ── Troops & Spells
  const buildTroopSection = (title, items, mappingKey) => {
    if (!items.length) return '';
    const activeTimers = new Set(
      [...(d.units || []), ...(d.spells || [])]
        .filter(x => x.timer && effectiveTimer(x.timer) > 0)
        .map(x => x.data)
    );
    const rows = items.map(u => {
      const name   = resolve(mappingKey, u.data);
      const isDark = M?.[mappingKey]?.[String(u.data)]?.dark;
      const inLab  = activeTimers.has(u.data);
      const cls    = [isDark ? 'dark-troop' : '', inLab ? 'upgrading-lab' : ''].filter(Boolean).join(' ');
      return `<div class="troop-row ${cls}"><span class="tname">${name}</span><span class="tlevel">Lv ${u.lvl}</span></div>`;
    }).join('');
    return section(mappingKey + '-section', title, items.length, `<div class="troop-grid">${rows}</div>`, true);
  };
  parts.push(buildTroopSection('⚗️ Troops', d.units, 'units'));
  parts.push(buildTroopSection('✨ Spells', d.spells, 'spells'));
  parts.push(buildTroopSection('🧱 Siege Machines', d.siegeMachines, 'siege_machines'));

  return parts.join('');
}

function buildingRow(b) {
  const cnt   = totalCount(b.levels);
  const range = levelRange(b.levels);
  const cntStr = cnt > 1 ? `<span class="cnt">×${cnt}</span>` : '';
  const dot = b.upgrading ? `<span class="upgrading-dot"></span>` : '';
  return `<div class="building-row${b.upgrading ? ' upgrading' : ''}">
    <span class="bname">${b.name}${dot}</span>
    <span class="blevel">${cntStr}${range}</span>
  </div>`;
}

// ── Analyze ────────────────────────────────────────────────

function doRender(data) {
  const parsed = parse(data);
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = render(parsed);
}

function analyze() {
  const raw = document.getElementById('json-input').value.trim();
  const errEl = document.getElementById('error-msg');
  errEl.textContent = '';

  if (!raw) { errEl.textContent = 'Paste your JSON export first.'; return; }
  if (!M)   { errEl.textContent = 'Mappings not loaded yet — please refresh.'; return; }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    errEl.textContent = 'Invalid JSON: ' + e.message;
    return;
  }

  // Use the game's own export timestamp for accurate elapsed time
  analyzeTimestamp = data.timestamp ? data.timestamp * 1000 : Date.now();
  rawData = data;

  doRender(data);
  const resultsEl = document.getElementById('results');
  resultsEl.style.display = 'block';
  document.getElementById('placeholder').style.display = 'none';
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  if (liveInterval) clearInterval(liveInterval);
  liveInterval = setInterval(tickTimers, 30000);
}

function tickTimers() {
  let anyExpired = false;

  document.querySelectorAll('[data-timer]').forEach(el => {
    const raw = parseInt(el.dataset.timer, 10);
    const eff = effectiveTimer(raw);

    if (el.classList.contains('timer')) {
      if (eff <= 0 && el.textContent !== 'Done') anyExpired = true;
      el.textContent = formatTimer(eff);
      el.className   = 'timer ' + timerClass(eff);
    } else {
      const suffix = el.classList.contains('hero-timer') ? ' remaining' : '';
      el.textContent = '⬆ ' + formatTimer(eff) + suffix;
    }
  });

  // Re-render when a timer expires so builder/lab counts update
  if (anyExpired && rawData) doRender(rawData);
}

function clearAll() {
  if (liveInterval) { clearInterval(liveInterval); liveInterval = null; }
  analyzeTimestamp = 0;
  rawData = null;
  document.getElementById('json-input').value = '';
  document.getElementById('error-msg').textContent = '';
  document.getElementById('results').style.display = 'none';
  document.getElementById('results').innerHTML = '';
  document.getElementById('placeholder').style.display = 'block';
}

function toggleSection(header) {
  header.classList.toggle('collapsed');
  header.nextElementSibling.classList.toggle('hidden');
}

document.addEventListener('DOMContentLoaded', init);
