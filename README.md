# Recursive Portal Waves

IITC-CE user script for showing recursive portal wave lists on the Ingress Intel Map.

## Install

1. Install a user script manager such as Tampermonkey.
2. Add `recursive-portal-waves.user.js`.
3. Open `https://intel.ingress.com/` with IITC-CE enabled.
4. Press the `Recursive Waves` button in the IITC toolbox.

The user script target is `https://intel.ingress.com/*`.

## Current Input Format

The current list format is pipe-separated:

```text
W1|37.529022|126.928673|50x
W1|37.519718|126.940803|50x
W2|37.520407|126.940686|10x
W2|37.527599|126.931967|10x
W2|37.525193|126.93693|13x
```

Columns:

- `W1`: wave
- `37.529022`: latitude
- `126.928673`: longitude
- `50x`: point value with trailing `x`

Blank lines and lines starting with `#` or `//` are ignored.

Invalid rows do not stop the import. The dialog shows the line number, reason, and original row for each error. Exact duplicate coordinate rows are ignored.

## Layers And Markers

- One `L.layerGroup()` is created for each wave, for example `W1` and `W2`.
- Layers are registered through `layerChooser.addOverlay()`.
- Wave colors are generated from the wave number.
- Markers show the point value and wave number.
- `50x` and higher point markers are larger and use a stronger double-outline glow.
- `mapDataRefreshEnd` still triggers a redraw. Coordinate rows draw immediately because they already contain latitude and longitude.

When a coordinate marker is clicked, the plugin looks for a loaded IITC portal marker at the same coordinates. If one is found, the click is forwarded to the original IITC marker so portal details open. If no loaded portal exists at that coordinate, the coordinate marker remains a visual marker only.

## Dialog Buttons

- `Apply`: save the input and redraw layers.
- `Current map rescan` / Japanese label in the UI: redraw against the current map state.
- `Move to drawn portals` / Japanese label in the UI: fit the map to drawn markers.
- `Delete all` / Japanese label in the UI: remove saved input and plugin layers.

## Legacy GUID Format

The older GUID format is still accepted for compatibility:

```text
20260530KureeW1R10D001    1f02b59e7fbb3457be0643de5b004b3c.16
```

Legacy GUID rows are drawn only when `window.portals[guid]` is already loaded by the Intel Map. The plugin does not make bulk Niantic detail requests.

## Limitation

For the old GUID-only format, GUID alone does not reveal the coordinates of unloaded portals. This plugin intentionally avoids mass detail requests to Niantic servers. If a future version adds `portalDetail.request(guid)`, it must have an explicit action button, slow queue, de-duplication, stop-on-failure behavior, and a hard request limit.

## Development Check

```sh
node --check recursive-portal-waves.user.js
```
