// ==UserScript==
// @id             recursive-portal-waves
// @name           IITC plugin: Recursive Portal Waves
// @category       Layer
// @version        0.2.0
// @description    Show recursive portal wave coordinate lists as IITC-CE layers.
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

(function () {
  'use strict';

  var wrapper = function (pluginInfo) {
    'use strict';

    if (typeof window.plugin !== 'function') {
      window.plugin = function () {};
    }

    var plugin = {};
    window.plugin.recursivePortalWaves = plugin;

    plugin.ID = 'recursive-portal-waves';
    plugin.NAME = 'Recursive Portal Waves';
    plugin.STORAGE_KEY = 'plugin-recursive-portal-waves-input';
    plugin.CODE_RE = /^(.+)W(\d+)R(\d+)D(\d+)$/;
    plugin.GUID_RE = /^[0-9a-f]{32}\.\d+$/;
    plugin.WAVE_RE = /^W(\d+)$/i;
    plugin.POINT_RE = /^(\d+(?:\.\d+)?)x$/i;
    plugin.COORD_MATCH_EPSILON = 0.000001;

    plugin.labels = {
      rescan: '\u73fe\u5728\u306eMAP\u3067\u518d\u7167\u5408',
      fit: '\u8868\u793a\u6e08\u307f\u30dd\u30fc\u30bf\u30eb\u3078\u79fb\u52d5',
      clear: '\u5168\u524a\u9664'
    };

    plugin.state = {
      isSetup: false,
      rawInput: '',
      entries: [],
      errors: [],
      duplicates: 0,
      layerGroups: {},
      layerNames: {},
      loadedLatLngs: [],
      stats: {
        total: 0,
        drawnMarkers: 0,
        coordinateRows: 0,
        unresolvedGuids: 0,
        errors: 0,
        duplicates: 0
      }
    };

    plugin.isCommentOrBlank = function (line) {
      var trimmed = String(line || '').trim();
      return !trimmed || trimmed.indexOf('#') === 0 || trimmed.indexOf('//') === 0;
    };

    plugin.parseNumber = function (value) {
      var number = Number(value);
      return typeof number === 'number' && isFinite(number) ? number : null;
    };

    plugin.parseCoordinateRow = function (rawLine, lineNumber, errors) {
      var parts = rawLine.trim().split('|').map(function (part) {
        return part.trim();
      });
      var waveMatch;
      var lat;
      var lng;
      var pointMatch;

      if (parts.length !== 4) {
        errors.push({
          line: lineNumber,
          reason: 'Expected four pipe-separated columns: Wn|lat|lng|pointsx.',
          raw: rawLine
        });
        return null;
      }

      waveMatch = plugin.WAVE_RE.exec(parts[0]);
      if (!waveMatch) {
        errors.push({
          line: lineNumber,
          reason: 'Wave column must look like W1, W2, ...',
          raw: rawLine
        });
        return null;
      }

      lat = plugin.parseNumber(parts[1]);
      if (lat === null || lat < -90 || lat > 90) {
        errors.push({
          line: lineNumber,
          reason: 'Latitude must be a number from -90 to 90.',
          raw: rawLine
        });
        return null;
      }

      lng = plugin.parseNumber(parts[2]);
      if (lng === null || lng < -180 || lng > 180) {
        errors.push({
          line: lineNumber,
          reason: 'Longitude must be a number from -180 to 180.',
          raw: rawLine
        });
        return null;
      }

      pointMatch = plugin.POINT_RE.exec(parts[3]);
      if (!pointMatch) {
        errors.push({
          line: lineNumber,
          reason: 'Point column must look like 10x, 13x, 50x, ...',
          raw: rawLine
        });
        return null;
      }

      return {
        source: 'coordinate',
        line: lineNumber,
        code: parts.join('|'),
        area: '',
        wave: parseInt(waveMatch[1], 10),
        waveText: waveMatch[1],
        point: parseFloat(pointMatch[1]),
        pointText: pointMatch[1],
        lat: lat,
        lng: lng,
        guid: null
      };
    };

    plugin.parseGuidRow = function (rawLine, lineNumber, errors) {
      var parts = rawLine.trim().split(/[\t ,]+/).filter(Boolean);
      var code;
      var guid;
      var match;

      if (parts.length !== 2) {
        errors.push({
          line: lineNumber,
          reason: parts.length < 2 ? 'Code and GUID are required.' : 'Expected exactly two columns.',
          raw: rawLine
        });
        return null;
      }

      code = parts[0];
      guid = parts[1];
      match = plugin.CODE_RE.exec(code);
      if (!match) {
        errors.push({
          line: lineNumber,
          reason: 'Code does not match ^(.+)W(\\d+)R(\\d+)D(\\d+)$.',
          raw: rawLine
        });
        return null;
      }

      if (!plugin.GUID_RE.test(guid)) {
        errors.push({
          line: lineNumber,
          reason: 'GUID does not match ^[0-9a-f]{32}\\.\\d+$.',
          raw: rawLine
        });
        return null;
      }

      return {
        source: 'guid',
        line: lineNumber,
        code: code,
        area: match[1],
        wave: parseInt(match[2], 10),
        waveText: match[2],
        point: parseInt(match[3], 10),
        pointText: match[3],
        dNumber: parseInt(match[4], 10),
        dNumberText: match[4],
        lat: null,
        lng: null,
        guid: guid
      };
    };

    plugin.entryKey = function (entry) {
      if (entry.source === 'coordinate') {
        return [
          entry.source,
          entry.waveText,
          entry.lat.toFixed(6),
          entry.lng.toFixed(6),
          entry.pointText
        ].join('|');
      }
      return [entry.source, entry.code, entry.guid].join('|');
    };

    plugin.parseInput = function (rawInput) {
      var lines = String(rawInput || '').split(/\r?\n/);
      var entries = [];
      var errors = [];
      var seen = {};
      var duplicates = 0;

      lines.forEach(function (line, index) {
        var lineNumber = index + 1;
        var entry;
        var key;

        if (plugin.isCommentOrBlank(line)) {
          return;
        }

        if (line.indexOf('|') !== -1) {
          entry = plugin.parseCoordinateRow(line, lineNumber, errors);
        } else {
          entry = plugin.parseGuidRow(line, lineNumber, errors);
        }

        if (!entry) {
          return;
        }

        key = plugin.entryKey(entry);
        if (seen[key]) {
          duplicates += 1;
          return;
        }
        seen[key] = true;
        entries.push(entry);
      });

      return {
        entries: entries,
        errors: errors,
        duplicates: duplicates
      };
    };

    plugin.loadInput = function () {
      try {
        return localStorage.getItem(plugin.STORAGE_KEY) || '';
      } catch (e) {
        console.warn(plugin.NAME + ': failed to load localStorage', e);
        return '';
      }
    };

    plugin.saveInput = function (rawInput) {
      try {
        if (rawInput) {
          localStorage.setItem(plugin.STORAGE_KEY, rawInput);
        } else {
          localStorage.removeItem(plugin.STORAGE_KEY);
        }
      } catch (e) {
        console.warn(plugin.NAME + ': failed to save localStorage', e);
      }
    };

    plugin.layerKeyForEntry = function (entry) {
      if (entry.area) {
        return entry.area + ' / W' + entry.waveText;
      }
      return 'W' + entry.waveText;
    };

    plugin.colorForWave = function (wave) {
      var hue = (wave * 67 + 198) % 360;
      return 'hsl(' + hue + ', 82%, 46%)';
    };

    plugin.escapeHtml = function (value) {
      return String(value).replace(/[&<>"']/g, function (character) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character];
      });
    };

    plugin.getPortalLatLng = function (portal) {
      var data;

      if (!portal) {
        return null;
      }
      if (typeof portal.getLatLng === 'function') {
        return portal.getLatLng();
      }
      if (portal._latlng) {
        return portal._latlng;
      }
      data = portal.options && portal.options.data;
      if (data && typeof data.latE6 === 'number' && typeof data.lngE6 === 'number') {
        return L.latLng(data.latE6 / 1000000, data.lngE6 / 1000000);
      }
      return null;
    };

    plugin.findLoadedPortalGuidAt = function (latLng) {
      var portals = window.portals || {};
      var guids = Object.keys(portals);
      var i;
      var portalLatLng;

      for (i = 0; i < guids.length; i += 1) {
        portalLatLng = plugin.getPortalLatLng(portals[guids[i]]);
        if (!portalLatLng) {
          continue;
        }
        if (
          Math.abs(portalLatLng.lat - latLng.lat) <= plugin.COORD_MATCH_EPSILON &&
          Math.abs(portalLatLng.lng - latLng.lng) <= plugin.COORD_MATCH_EPSILON
        ) {
          return guids[i];
        }
      }
      return null;
    };

    plugin.forwardPortalClick = function (guid, originalEvent) {
      var portal = window.portals && window.portals[guid];

      if (!portal) {
        return false;
      }
      if (typeof portal.fire === 'function') {
        portal.fire('click', { originalEvent: originalEvent });
        return true;
      }
      if (typeof portal.fireEvent === 'function') {
        portal.fireEvent('click', { originalEvent: originalEvent });
        return true;
      }
      if (typeof window.renderPortalDetails === 'function') {
        window.renderPortalDetails(guid);
        return true;
      }
      return false;
    };

    plugin.markerTitle = function (entry) {
      if (entry.source === 'coordinate') {
        return 'W' + entry.waveText + ' ' + entry.pointText + 'x (' + entry.lat + ', ' + entry.lng + ')';
      }
      return entry.code;
    };

    plugin.createMarker = function (entry, latLng) {
      var highValue = entry.point >= 50;
      var color = plugin.colorForWave(entry.wave);
      var size = highValue ? 38 : 30;
      var primaryLabel = entry.source === 'coordinate' ? entry.pointText + 'x' : 'D' + entry.dNumberText;
      var secondaryLabel = entry.source === 'coordinate' ? 'W' + entry.waveText : 'R' + entry.pointText;
      var marker;
      var icon = L.divIcon({
        className: 'rpw-div-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: [
          '<div class="rpw-marker ',
          highValue ? 'rpw-marker-r50' : 'rpw-marker-r10',
          '" style="--rpw-wave-color:',
          color,
          '">',
          '<span class="rpw-marker-main">',
          plugin.escapeHtml(primaryLabel),
          '</span>',
          '<span class="rpw-marker-sub">',
          plugin.escapeHtml(secondaryLabel),
          '</span>',
          '</div>'
        ].join('')
      });

      marker = L.marker(latLng, {
        icon: icon,
        interactive: true,
        keyboard: false,
        title: plugin.markerTitle(entry)
      });
      marker.on('click', function (event) {
        var guid = entry.guid || plugin.findLoadedPortalGuidAt(latLng);
        if (guid) {
          plugin.forwardPortalClick(guid, event.originalEvent);
        }
      });
      return marker;
    };

    plugin.removeLayerFromChooser = function (layer) {
      if (!layer) {
        return;
      }
      if (window.map && window.map.hasLayer(layer)) {
        window.map.removeLayer(layer);
      }
      if (window.layerChooser) {
        if (typeof window.layerChooser.removeLayer === 'function') {
          window.layerChooser.removeLayer(layer);
        } else if (typeof window.layerChooser.removeOverlay === 'function') {
          window.layerChooser.removeOverlay(layer);
        }
      }
    };

    plugin.clearLayerRegistry = function () {
      Object.keys(plugin.state.layerGroups).forEach(function (key) {
        plugin.removeLayerFromChooser(plugin.state.layerGroups[key]);
      });
      plugin.state.layerGroups = {};
      plugin.state.layerNames = {};
      plugin.state.loadedLatLngs = [];
    };

    plugin.ensureLayerGroups = function () {
      var needed = {};

      plugin.state.entries.forEach(function (entry) {
        var key = plugin.layerKeyForEntry(entry);
        var group;

        needed[key] = true;
        if (plugin.state.layerGroups[key]) {
          return;
        }

        group = L.layerGroup();
        plugin.state.layerGroups[key] = group;
        plugin.state.layerNames[key] = key;

        if (window.layerChooser && typeof window.layerChooser.addOverlay === 'function') {
          window.layerChooser.addOverlay(group, key);
        }
        if (window.map && typeof window.map.addLayer === 'function') {
          window.map.addLayer(group);
        }
      });

      Object.keys(plugin.state.layerGroups).forEach(function (key) {
        if (!needed[key]) {
          plugin.removeLayerFromChooser(plugin.state.layerGroups[key]);
          delete plugin.state.layerGroups[key];
          delete plugin.state.layerNames[key];
        }
      });
    };

    plugin.applyInput = function (rawInput) {
      var parsed = plugin.parseInput(rawInput);

      plugin.state.rawInput = rawInput;
      plugin.state.entries = parsed.entries;
      plugin.state.errors = parsed.errors;
      plugin.state.duplicates = parsed.duplicates;
      plugin.saveInput(rawInput);
      plugin.ensureLayerGroups();
      plugin.redraw();
      return plugin.state.stats;
    };

    plugin.latLngForEntry = function (entry, unresolved) {
      var portal;
      var latLng;

      if (entry.source === 'coordinate') {
        return L.latLng(entry.lat, entry.lng);
      }

      portal = window.portals && window.portals[entry.guid];
      if (!portal) {
        unresolved[entry.guid] = true;
        return null;
      }
      latLng = plugin.getPortalLatLng(portal);
      if (!latLng) {
        unresolved[entry.guid] = true;
      }
      return latLng;
    };

    plugin.redraw = function () {
      var unresolved = {};
      var loadedLatLngs = [];
      var drawnMarkers = 0;
      var coordinateRows = 0;

      Object.keys(plugin.state.layerGroups).forEach(function (key) {
        plugin.state.layerGroups[key].clearLayers();
      });

      plugin.state.entries.forEach(function (entry) {
        var latLng = plugin.latLngForEntry(entry, unresolved);
        var key;
        var marker;

        if (entry.source === 'coordinate') {
          coordinateRows += 1;
        }

        if (!latLng) {
          return;
        }

        key = plugin.layerKeyForEntry(entry);
        if (!plugin.state.layerGroups[key]) {
          return;
        }

        marker = plugin.createMarker(entry, latLng);
        plugin.state.layerGroups[key].addLayer(marker);
        loadedLatLngs.push(latLng);
        drawnMarkers += 1;
      });

      plugin.state.loadedLatLngs = loadedLatLngs;
      plugin.state.stats = {
        total: plugin.state.entries.length,
        drawnMarkers: drawnMarkers,
        coordinateRows: coordinateRows,
        unresolvedGuids: Object.keys(unresolved).length,
        errors: plugin.state.errors.length,
        duplicates: plugin.state.duplicates
      };
      plugin.updateOpenDialogStats();
    };

    plugin.fitLoadedPortals = function () {
      var bounds;

      if (!window.map || !plugin.state.loadedLatLngs.length) {
        window.alert('No Recursive Waves markers are drawn.');
        return;
      }

      bounds = L.latLngBounds(plugin.state.loadedLatLngs);
      window.map.fitBounds(bounds.pad(0.15));
    };

    plugin.deleteAll = function () {
      plugin.state.rawInput = '';
      plugin.state.entries = [];
      plugin.state.errors = [];
      plugin.state.duplicates = 0;
      plugin.state.stats = {
        total: 0,
        drawnMarkers: 0,
        coordinateRows: 0,
        unresolvedGuids: 0,
        errors: 0,
        duplicates: 0
      };
      plugin.saveInput('');
      plugin.clearLayerRegistry();
      plugin.updateOpenDialogStats();
    };

    plugin.renderStatsHtml = function () {
      var stats = plugin.state.stats;
      var errorsHtml = '';

      if (plugin.state.errors.length) {
        errorsHtml = [
          '<details class="rpw-errors" open>',
          '<summary>Input errors (',
          plugin.state.errors.length,
          ')</summary>',
          '<ol>',
          plugin.state.errors.map(function (error) {
            return [
              '<li><strong>Line ',
              error.line,
              ':</strong> ',
              plugin.escapeHtml(error.reason),
              '<pre>',
              plugin.escapeHtml(error.raw),
              '</pre></li>'
            ].join('');
          }).join(''),
          '</ol>',
          '</details>'
        ].join('');
      }

      return [
        '<div class="rpw-stat-grid">',
        '<div><strong>',
        stats.total,
        '</strong><span>valid rows</span></div>',
        '<div><strong>',
        stats.drawnMarkers,
        '</strong><span>drawn markers</span></div>',
        '<div><strong>',
        stats.coordinateRows,
        '</strong><span>coordinate rows</span></div>',
        '<div><strong>',
        stats.unresolvedGuids,
        '</strong><span>unresolved GUID rows</span></div>',
        '<div><strong>',
        stats.errors,
        '</strong><span>input errors</span></div>',
        '<div><strong>',
        stats.duplicates,
        '</strong><span>duplicates ignored</span></div>',
        '</div>',
        errorsHtml
      ].join('');
    };

    plugin.updateOpenDialogStats = function () {
      var container = document.querySelector('.rpw-dialog .rpw-stats');

      if (container) {
        container.innerHTML = plugin.renderStatsHtml();
      }
    };

    plugin.openDialog = function () {
      var dialogId = 'rpw-dialog-' + Date.now();
      var html = [
        '<div id="',
        dialogId,
        '" class="rpw-dialog">',
        '<textarea class="rpw-input" spellcheck="false" placeholder="W1|37.529022|126.928673|50x&#10;W2|37.520407|126.940686|10x"></textarea>',
        '<div class="rpw-actions">',
        '<button type="button" class="rpw-apply">Apply</button>',
        '<button type="button" class="rpw-rescan">',
        plugin.labels.rescan,
        '</button>',
        '<button type="button" class="rpw-fit">',
        plugin.labels.fit,
        '</button>',
        '<button type="button" class="rpw-clear">',
        plugin.labels.clear,
        '</button>',
        '</div>',
        '<div class="rpw-stats">',
        plugin.renderStatsHtml(),
        '</div>',
        '</div>'
      ].join('');
      var root;
      var input;

      window.dialog({
        title: plugin.NAME,
        html: html,
        width: Math.min(720, Math.max(320, window.innerWidth - 24))
      });

      root = document.getElementById(dialogId);
      if (!root) {
        return;
      }

      input = root.querySelector('.rpw-input');
      input.value = plugin.state.rawInput;

      root.querySelector('.rpw-apply').addEventListener('click', function () {
        plugin.applyInput(input.value);
      });
      root.querySelector('.rpw-rescan').addEventListener('click', function () {
        plugin.redraw();
      });
      root.querySelector('.rpw-fit').addEventListener('click', function () {
        plugin.fitLoadedPortals();
      });
      root.querySelector('.rpw-clear').addEventListener('click', function () {
        if (window.confirm('Delete all Recursive Waves input and layers?')) {
          input.value = '';
          plugin.deleteAll();
        }
      });
    };

    plugin.injectCss = function () {
      var style = document.createElement('style');
      style.textContent = [
        '.rpw-dialog{box-sizing:border-box;max-width:100%;}',
        '.rpw-input{box-sizing:border-box;width:100%;min-height:240px;resize:vertical;font-family:monospace;font-size:12px;line-height:1.45;}',
        '.rpw-actions{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0;}',
        '.rpw-actions button{min-height:32px;padding:4px 10px;}',
        '.rpw-stat-grid{display:grid;grid-template-columns:repeat(6,minmax(82px,1fr));gap:6px;margin-top:8px;}',
        '.rpw-stat-grid div{border:1px solid #555;background:#1f1f1f;padding:6px;border-radius:4px;}',
        '.rpw-stat-grid strong{display:block;font-size:18px;line-height:1.1;color:#fff;}',
        '.rpw-stat-grid span{display:block;font-size:11px;color:#bbb;}',
        '.rpw-errors{margin-top:8px;max-height:180px;overflow:auto;}',
        '.rpw-errors ol{margin:6px 0 0 22px;padding:0;}',
        '.rpw-errors li{margin-bottom:6px;}',
        '.rpw-errors pre{white-space:pre-wrap;word-break:break-word;margin:3px 0 0;padding:4px;background:#111;border:1px solid #444;}',
        '.rpw-div-icon{background:transparent;border:0;}',
        '.rpw-marker{box-sizing:border-box;width:100%;height:100%;border-radius:50%;border:2px solid #fff;background:var(--rpw-wave-color);box-shadow:0 0 0 2px rgba(0,0,0,.72),0 0 12px var(--rpw-wave-color);display:flex;align-items:center;justify-content:center;flex-direction:column;color:#fff;text-shadow:0 1px 2px #000;font-family:Arial,sans-serif;font-weight:700;line-height:1;}',
        '.rpw-marker-r50{border-width:3px;box-shadow:0 0 0 2px #fff,0 0 0 5px rgba(0,0,0,.76),0 0 18px 5px var(--rpw-wave-color);}',
        '.rpw-marker-main{font-size:11px;}',
        '.rpw-marker-sub{font-size:10px;margin-top:1px;}',
        '@media (max-width:520px){.rpw-input{min-height:180px;font-size:11px;}.rpw-actions button{flex:1 1 48%;padding:4px 6px;}.rpw-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr));}.rpw-stat-grid div{padding:5px;}.ui-dialog{max-width:calc(100vw - 10px)!important;}}'
      ].join('\n');
      document.head.appendChild(style);
    };

    plugin.setupToolbox = function () {
      if (window.IITC && window.IITC.toolbox && typeof window.IITC.toolbox.addButton === 'function') {
        window.IITC.toolbox.addButton({
          label: 'Recursive Waves',
          title: plugin.NAME,
          action: plugin.openDialog
        });
      } else {
        console.warn(plugin.NAME + ': IITC.toolbox.addButton() is not available.');
      }
    };

    plugin.setup = function () {
      if (plugin.state.isSetup) {
        return;
      }
      plugin.state.isSetup = true;

      plugin.injectCss();
      plugin.setupToolbox();
      plugin.state.rawInput = plugin.loadInput();
      if (plugin.state.rawInput) {
        plugin.applyInput(plugin.state.rawInput);
      }
      if (typeof window.addHook === 'function') {
        window.addHook('mapDataRefreshEnd', plugin.redraw);
      }
    };

    plugin.setup.info = pluginInfo;

    if (!window.bootPlugins) {
      window.bootPlugins = [];
    }
    window.bootPlugins.push(plugin.setup);
    if (window.iitcLoaded) {
      plugin.setup();
    }
  };

  var info = {};
  if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
      version: GM_info.script.version,
      name: GM_info.script.name,
      description: GM_info.script.description
    };
  }

  var script = document.createElement('script');
  script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
  (document.body || document.head || document.documentElement).appendChild(script);
})();
