(function () {
  let canvas, context, projection, land, landRequest, countries = [], markers = [], visible = [], onCountry = () => {}, selected = '', frame = 0;
  let longitude = -20, latitude = 15, zoom = 1;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const nameKey = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

  function locationForCountry(country, features = land?.features || []) {
    if (!country || nameKey(country) === 'global') return null;
    const configured = window.ClustrConfig?.COUNTRY_COORDS?.[country];
    if (Array.isArray(configured) && configured.length === 2 && configured.every(Number.isFinite)) return configured;
    const name = nameKey(country);
    const match = features.find(feature => [feature.properties?.ADMIN, feature.properties?.NAME, feature.properties?.NAME_LONG].some(value => nameKey(value) === name));
    const lat = Number(match?.properties?.LABEL_Y), lon = Number(match?.properties?.LABEL_X);
    return match && Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
  }

  function updateMarkers() {
    markers = countries.map(item => ({ ...item, coords: locationForCountry(item.country) })).filter(item => item.coords);
    const total = countries.reduce((count, item) => count + item.count, 0);
    const count = document.getElementById('globeCount');
    if (count) count.textContent = `${markers.length} mapped locations · ${total} stories`;
  }

  function size() {
    if (!canvas) return false;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    projection.scale(Math.min(width, height) * 0.42 * zoom).translate([width / 2, height / 2]).rotate([-longitude, -latitude]);
    return true;
  }

  function paint() {
    frame = 0;
    if (!context || !window.d3 || !size()) return;
    const width = canvas.clientWidth, height = canvas.clientHeight, radius = projection.scale();
    const [cx, cy] = projection.translate(), path = window.d3.geoPath(projection, context);
    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#6de2b5';
    context.clearRect(0, 0, width, height);
    const ocean = context.createRadialGradient(cx - radius * .32, cy - radius * .38, radius * .08, cx, cy, radius * 1.18);
    ocean.addColorStop(0, '#245675');
    ocean.addColorStop(.58, '#123449');
    ocean.addColorStop(1, '#071826');
    context.beginPath(); path({ type: 'Sphere' }); context.fillStyle = ocean; context.fill();
    context.save();
    context.beginPath(); path({ type: 'Sphere' }); context.clip();
    context.beginPath(); path(window.d3.geoGraticule10()); context.strokeStyle = 'rgba(178,224,232,.13)'; context.lineWidth = .7; context.stroke();
    if (land) {
      context.beginPath(); path(land); context.fillStyle = '#416b73'; context.fill();
      context.strokeStyle = 'rgba(173,220,204,.45)'; context.lineWidth = .55; context.stroke();
    }
    context.restore();
    context.beginPath(); path({ type: 'Sphere' }); context.strokeStyle = 'rgba(151,218,230,.65)'; context.lineWidth = 1.5; context.stroke();
    visible = [];
    for (const item of markers) {
      const [lat, lon] = item.coords;
      if (window.d3.geoDistance([lon, lat], [longitude, latitude]) >= Math.PI / 2) continue;
      const [x, y] = projection([lon, lat]), active = item.country === selected, r = clamp(5 + Math.sqrt(item.count) * 2, 7, 17);
      visible.push({ ...item, x, y, radius: r });
      context.beginPath(); context.arc(x, y, r + (active ? 7 : 4), 0, Math.PI * 2);
      context.fillStyle = active ? 'rgba(255,211,139,.25)' : 'rgba(94,229,191,.18)'; context.fill();
      context.beginPath(); context.arc(x, y, r, 0, Math.PI * 2);
      context.fillStyle = active ? '#ffd38b' : accent; context.fill();
      context.lineWidth = 2; context.strokeStyle = '#102d3a'; context.stroke();
      context.fillStyle = '#08242c'; context.font = '700 11px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(item.count > 99 ? '99+' : String(item.count), x, y + .5);
    }
    if (selected) {
      const item = visible.find(marker => marker.country === selected);
      if (item) {
        context.font = '600 12px system-ui'; context.textAlign = 'center'; context.textBaseline = 'bottom';
        context.fillStyle = '#f4faf9'; context.shadowColor = '#071826'; context.shadowBlur = 8;
        context.fillText(item.country, item.x, item.y - item.radius - 8); context.shadowBlur = 0;
      }
    }
  }

  function invalidate() {
    if (!frame) frame = requestAnimationFrame(paint);
  }

  function focusCountry(country) {
    selected = country;
    const coords = locationForCountry(country);
    if (coords) { latitude = clamp(coords[0], -70, 70); longitude = coords[1]; }
    invalidate();
  }

  function ensureMap() {
    if (canvas) return canvas;
    canvas = document.getElementById('map');
    if (!canvas || !window.d3) {
      const status = document.getElementById('globeStatus');
      if (status) status.textContent = 'The globe could not load. Use the country list to browse stories.';
      return null;
    }
    context = canvas.getContext('2d');
    if (!context) return null;
    projection = window.d3.geoOrthographic().clipAngle(90).precision(.5);
    let drag = null;
    const tooltip = document.getElementById('globeTooltip');
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, longitude, latitude, moved: false };
      canvas.setPointerCapture(event.pointerId);
      if (tooltip) tooltip.hidden = true;
    });
    canvas.addEventListener('pointermove', event => {
      if (drag) {
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        if (drag.moved) { longitude = ((drag.longitude - dx * .35 + 540) % 360) - 180; latitude = clamp(drag.latitude + dy * .3, -75, 75); invalidate(); }
        return;
      }
      const bounds = canvas.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      const hit = visible.find(item => Math.hypot(item.x - x, item.y - y) <= item.radius + 8);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      if (tooltip) {
        tooltip.hidden = !hit;
        if (hit) { tooltip.textContent = `${hit.country} · ${hit.count} stories`; tooltip.style.left = `${clamp(x + 12, 8, bounds.width - 170)}px`; tooltip.style.top = `${clamp(y + 12, 8, bounds.height - 32)}px`; }
      }
    });
    canvas.addEventListener('pointerup', event => {
      if (!drag) return;
      const moved = drag.moved; drag = null;
      if (moved) return;
      const bounds = canvas.getBoundingClientRect(), x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      const hit = visible.find(item => Math.hypot(item.x - x, item.y - y) <= item.radius + 8);
      if (hit) { focusCountry(hit.country); onCountry(hit.country, hit.coords); }
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    canvas.addEventListener('pointerleave', () => { if (tooltip) tooltip.hidden = true; });
    canvas.addEventListener('wheel', event => { event.preventDefault(); zoom = clamp(zoom * (event.deltaY > 0 ? .9 : 1.1), .7, 1.4); invalidate(); }, { passive: false });
    canvas.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') longitude -= 12;
      else if (event.key === 'ArrowRight') longitude += 12;
      else if (event.key === 'ArrowUp') latitude = clamp(latitude + 10, -75, 75);
      else if (event.key === 'ArrowDown') latitude = clamp(latitude - 10, -75, 75);
      else if (event.key === '+' || event.key === '=') zoom = clamp(zoom * 1.1, .7, 1.4);
      else if (event.key === '-') zoom = clamp(zoom / 1.1, .7, 1.4);
      else return;
      event.preventDefault(); invalidate();
    });
    document.querySelectorAll('[data-globe-zoom]').forEach(button => button.addEventListener('click', () => {
      zoom = clamp(zoom * (button.dataset.globeZoom === 'in' ? 1.2 : 1 / 1.2), .7, 1.4); invalidate();
    }));
    document.querySelector('[data-globe-reset]')?.addEventListener('click', () => { longitude = -20; latitude = 15; zoom = 1; selected = ''; invalidate(); });
    new ResizeObserver(invalidate).observe(canvas);
    return canvas;
  }

  function render(groups, handlers = {}) {
    if (!ensureMap()) return;
    onCountry = handlers.onCountry || (() => {});
    countries = window.ClustrRender?.collectCountries(groups || []) || [];
    if (!countries.some(item => item.country === selected)) selected = '';
    updateMarkers(); invalidate();
    if (!landRequest) landRequest = fetch('assets/world-110m.json').then(response => {
      if (!response.ok) throw new Error('Globe map unavailable');
      return response.json();
    }).then(data => { land = data; updateMarkers(); invalidate(); }).catch(() => {
      const status = document.getElementById('globeStatus');
      if (status) status.textContent = 'Land outlines could not load. Country locations remain available.';
    });
  }

  window.ClustrMap = { ensureMap, invalidate, render, renderBubbles: render, focusCountry, locationForCountry };
  window.EventlineMap = window.ClustrMap;
})();
