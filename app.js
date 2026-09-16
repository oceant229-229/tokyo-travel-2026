/* =========================================================
   日 本 旅 行 PWA · app.js（完整版）
   ========================================================= */
'use strict';

/* ---------- 1. 类型元数据 ---------- */
const TYPE_META = {
  hotel:    { label: '酒店',      color: '#2563eb', emoji: '🏨' },
  reserved: { label: '准时预约',  color: '#dc2626', emoji: '⏰' },
  fixed:    { label: '固定行程',  color: '#ef4444', emoji: '📍' },
  museum:   { label: '美展展讯',  color: '#7c3aed', emoji: '🎨' },
  food_A:   { label: '餐饮 A',    color: '#f59e0b', emoji: '🍜' },
  food_B:   { label: '餐饮 B',    color: '#ca8a04', emoji: '🍰' },
  random:   { label: '随机行程',  color: '#16a34a', emoji: '🎲' },
  shop:     { label: '可选店铺',  color: '#16a34a', emoji: '🛍️' }
};

const LEGEND_ORDER = ['hotel', 'reserved', 'fixed', 'museum', 'food_A', 'food_B', 'random', 'shop'];

/* ---------- 2. 全局状态 ---------- */
const STATE = {
  data: null,
  dayIndex: 0,
  map: null,
  layer: null
};

/* ---------- 3. 工具函数 ---------- */
const $ = (sel) => document.querySelector(sel);

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function pad2(n) { return String(n).padStart(2, '0'); }

const TOKYO_HM = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function fmtTokyoTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return TOKYO_HM.format(d);
}

function gmapUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function shortDate(dateStr) {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return dateStr;
  return `${Number(m[2])}/${Number(m[3])}`;
}

/* ---------- 4. Toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- 5. 网络状态 ---------- */
function bindNetwork() {
  const pill = $('#netPill');
  const txt  = $('#netText');
  if (!pill || !txt) return;

  const render = (notify) => {
    const online = navigator.onLine;
    pill.dataset.state = online ? 'online' : 'offline';
    txt.textContent = online ? '在线' : '离线';
    if (notify) toast(online ? '已恢复网络连接' : '离线模式 · 行程与预约码仍可查看');
  };

  window.addEventListener('online',  () => render(true));
  window.addEventListener('offline', () => render(true));
  render(false);
}

/* ---------- 6. Header：航班 + 倒计时 ---------- */
function renderHeader() {
  const trip = (STATE.data && STATE.data.trip) || {};

  const titleEl = $('#tripTitle');
  const subEl   = $('#tripSub');
  if (titleEl) titleEl.textContent = trip.title || '日本旅行';
  if (subEl)   subEl.textContent   = trip.subtitle || '';

  const bar = $('#flightBar');
  if (!bar) return;
  bar.innerHTML = '';

  const order  = ['outbound', 'inbound'];
  const labels = { outbound: '去程', inbound: '回程' };

  order.forEach((key) => {
    const f = trip.flights && trip.flights[key];
    if (!f) return;

    const el = document.createElement('div');
    el.className = 'fc ' + (key === 'outbound' ? 'out' : 'in');
    el.innerHTML = `
      <div class="fc-head">
        <span class="fc-tag">${labels[key]}</span>
        <span class="fc-code">${esc(f.code || '')}</span>
        <span class="fc-airline">${esc(f.airline || '')}</span>
      </div>
      <div class="fc-count" data-iso="${esc(f.from && f.from.time)}">—</div>
      <div class="fc-route">
        <span class="fc-port">
          ${esc((f.from && f.from.city) || '')}
          ${f.from && f.from.terminal ? esc(f.from.terminal) : ''}
          <b>${fmtTokyoTime(f.from && f.from.time)}</b>
        </span>
        <span class="fc-line"></span>
        <span class="fc-port">
          ${esc((f.to && f.to.city) || '')}
          ${f.to && f.to.terminal ? esc(f.to.terminal) : ''}
          <b>${fmtTokyoTime(f.to && f.to.time)}</b>
        </span>
      </div>
    `;
    bar.appendChild(el);
  });

  tickCountdowns();
}

function tickCountdowns() {
  document.querySelectorAll('.fc-count[data-iso]').forEach((el) => {
    const iso = el.dataset.iso;
    if (!iso) return;

    const target = new Date(iso).getTime();
    if (isNaN(target)) { el.textContent = '--'; return; }

    const diff = target - Date.now();

    if (diff > 0) {
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.classList.remove('departed');
      el.textContent = `T-${d}天 ${pad2(h)}:${pad2(m)}:${pad2(s)}`;
    } else {
      el.classList.add('departed');
      el.textContent = '已起飞';
    }
  });
}

/* ---------- 7. Tabs ---------- */
function renderTabs() {
  const nav = $('#dayTabs');
  if (!nav || !STATE.data || !STATE.data.days) return;
  nav.innerHTML = '';

  STATE.data.days.forEach((day, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (i === STATE.dayIndex ? ' active' : '');
    btn.innerHTML = `
      <span class="tab-day">${esc(day.label)}</span>
      <span class="tab-date">${esc(shortDate(day.date))}</span>
    `;
    btn.addEventListener('click', () => selectDay(i));
    nav.appendChild(btn);
  });

  scrollTabIntoView(STATE.dayIndex, false);
}

function scrollTabIntoView(index, smooth = true) {
  const nav = $('#dayTabs');
  if (!nav) return;
  const tab = nav.children[index];
  if (!tab) return;
  nav.scrollTo({
    left: tab.offsetLeft - nav.clientWidth / 2 + tab.clientWidth / 2,
    behavior: smooth ? 'smooth' : 'auto'
  });
}

function selectDay(index) {
  STATE.dayIndex = index;

  const nav = $('#dayTabs');
  if (nav) {
    [...nav.children].forEach((t, i) => t.classList.toggle('active', i === index));
  }

  scrollTabIntoView(index);
  renderDay();
}

/* ---------- 8. 渲染某一天 ---------- */
function renderDay() {
  if (!STATE.data || !STATE.data.days) return;
  const day = STATE.data.days[STATE.dayIndex];
  if (!day) return;

  const tEl = $('#dayTitle');
  const sEl = $('#daySub');
  const cEl = $('#dayCount');
  if (tEl) tEl.textContent = `${day.label} · ${day.title || ''}`;
  if (sEl) sEl.textContent = day.subtitle || day.city || '';
  if (cEl) cEl.textContent = `${(day.items || []).length} 项`;

  renderLegend();
  renderMap(day);
  renderTimeline(day);
}

/* ---------- 9. 图例 ---------- */
function renderLegend() {
  const box = $('#legend');
  if (!box) return;
  box.innerHTML = LEGEND_ORDER.map((k) => {
    const m = TYPE_META[k];
    return `<span class="lg"><i style="background:${m.color}"></i>${m.emoji} ${m.label}</span>`;
  }).join('');
}

/* ---------- 10. 地图 ---------- */
function ensureMap() {
  if (STATE.map) return STATE.map;

  const el = document.getElementById('map');
  if (!el || typeof L === 'undefined') return null;

  STATE.map = L.map(el, {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true
  });

 L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
  maxZoom: 19,
  minZoom: 3,
  subdomains: 'abcd',
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(STATE.map);

  STATE.layer = L.layerGroup().addTo(STATE.map);
  return STATE.map;
}

function renderMap(day) {
  const map = ensureMap();
  if (!map) return;

  STATE.layer.clearLayers();

  const items = (day.items || []).filter(
    (it) => typeof it.lat === 'number' && typeof it.lng === 'number'
  );

  const pts = [];

  items.forEach((item) => {
    const meta = TYPE_META[item.type] || TYPE_META.fixed;

    const icon = L.divIcon({
      className: 'pin',
      html: `<div class="pin-body" style="--pin:${meta.color}">
               <span class="pin-ico">${meta.emoji}</span>
             </div>`,
      iconSize: [30, 34],
      iconAnchor: [15, 32],
      popupAnchor: [0, -30]
    });

    const marker = L.marker([item.lat, item.lng], {
      icon,
      title: item.title || '',
      keyboard: false
    });

    marker.bindPopup(popupHtml(item, meta), {
      maxWidth: 268,
      minWidth: 190,
      closeButton: true,
      autoPanPadding: [28, 28]
    });

    marker.addTo(STATE.layer);
    pts.push([item.lat, item.lng]);
  });

  // 路线虚线
  if (pts.length > 1) {
    L.polyline(pts, {
      color: '#94a3b8',
      weight: 2,
      opacity: 0.65,
      dashArray: '5 7',
      lineCap: 'round'
    }).addTo(STATE.layer);
  }

  // 视野
  if (pts.length === 0) {
    map.setView(day.center || [35.6812, 139.7671], day.zoom || 12);
  } else if (pts.length === 1) {
    map.setView(pts[0], 15);
  } else {
    map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
  }

  setTimeout(() => STATE.map && STATE.map.invalidateSize(), 90);
}

function popupHtml(item, meta) {
  const hasGeo = typeof item.lat === 'number' && typeof item.lng === 'number';
  const nav = hasGeo ? gmapUrl(item.lat, item.lng) : null;

  return `
    <div class="pop">
      <span class="pop-badge" style="--tc:${meta.color}">${meta.emoji} ${meta.label}</span>
      <div class="pop-title">${esc(item.title)}</div>
      ${item.time ? `<div class="pop-time">🕘 ${esc(item.time)}${item.endTime ? ' – ' + esc(item.endTime) : ''}</div>` : ''}
      ${item.desc ? `<div class="pop-desc">${esc(item.desc)}</div>` : ''}
      ${item.bookingCode ? `<div class="pop-code">预约码 <b>${esc(item.bookingCode)}</b></div>` : ''}
      ${nav ? `<a class="pop-nav" href="${nav}" target="_blank" rel="noopener">🧭 在 Google 地图导航</a>` : ''}
    </div>
  `;
}

/* ---------- 11. 时间轴 ---------- */
function renderTimeline(day) {
  const box = $('#timeline');
  if (!box) return;

  const items = day.items || [];

  // 同一天同一时刻显示排序：按 time 升序（无 time 的放最后）
  const sorted = [...items].sort((a, b) => {
    const ta = a.time || '99:99';
    const tb = b.time || '99:99';
    return ta.localeCompare(tb);
  });

  if (sorted.length === 0) {
    box.innerHTML = `<div class="empty">今天没有安排 ✨</div>`;
    return;
  }

  box.innerHTML = sorted.map((it) => tlItemHtml(it)).join('');

  // 复制预约码
  box.querySelectorAll('.tl-copy').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = btn.dataset.code || '';
      try {
        await navigator.clipboard.writeText(code);
        toast('预约码已复制：' + code);
      } catch {
        toast('复制失败，请长按手动复制');
      }
    });
  });

  // 点击卡片 → 地图上打开对应 popup
  box.querySelectorAll('.tl-card[data-id]').forEach((card) => {
    card.addEventListener('click', () => {
      if (!STATE.layer) return;
      STATE.layer.eachLayer((m) => {
        if (m instanceof L.Marker && m.options.title === card.dataset.title) {
          m.openPopup();
        }
      });
    });
  });
}

function tlItemHtml(item) {
  const meta = TYPE_META[item.type] || TYPE_META.fixed;
  const hasGeo = typeof item.lat === 'number' && typeof item.lng === 'number';
  const isReserved = item.type === 'reserved';

  return `
    <div class="tl-item" style="--tc:${meta.color}">
      <div class="tl-time">
        ${esc(item.time || '')}
        ${item.endTime ? `<span class="end">${esc(item.endTime)}</span>` : ''}
      </div>
      <div class="tl-rail"><div class="tl-dot"></div></div>
      <div class="tl-card" data-id="${esc(item.id || '')}" data-title="${esc(item.title || '')}">
        <div class="tl-top">
          <span class="tl-badge">${meta.emoji} ${meta.label}</span>
          ${isReserved ? `<span class="tl-flag">已预约</span>` : ''}
        </div>
        <h4 class="tl-title">${esc(item.title || '')}</h4>
        ${item.desc ? `<p class="tl-desc">${esc(item.desc)}</p>` : ''}
        ${item.bookingCode ? `
          <div class="tl-code">
            <span>预约码</span><b>${esc(item.bookingCode)}</b>
            <button type="button" class="tl-copy" data-code="${esc(item.bookingCode)}">复制</button>
          </div>
        ` : ''}
        ${hasGeo ? `
          <div class="tl-actions">
            <a class="btn btn-primary" href="${gmapUrl(item.lat, item.lng)}" target="_blank" rel="noopener">🧭 导航</a>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

/* ---------- 12. 启动 ---------- */
async function loadData() {
  const res = await fetch('./data.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`data.json 加载失败：HTTP ${res.status}`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error('data.json 不是合法的 JSON：' + e.message);
  }
}

function renderFatalError(msg) {
  const sub = $('#tripSub');
  if (sub) sub.textContent = '数据加载失败';
  const tl = $('#timeline');
  if (tl) {
    tl.innerHTML = `<div class="empty">
      ⚠️ ${esc(msg)}<br><br>
      请确认 <b>data.json</b> 已上传到仓库根目录，且内容为合法 JSON。
    </div>`;
  }
}

async function init() {
  try {
    STATE.data = await loadData();
    renderHeader();
    renderTabs();
    renderDay();
    bindNetwork();

    // 倒计时每秒刷新
    setInterval(tickCountdowns, 1000);
  } catch (err) {
    console.error('[init]', err);
    renderFatalError(err.message || String(err));
  }
}

/* ---------- 13. Service Worker 注册 ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('[SW] 注册失败', err);
    });
  });
}

/* ---------- 14. DOM Ready ---------- */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
