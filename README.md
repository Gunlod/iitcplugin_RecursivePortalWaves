# Recursive Portal Waves

IITC-CE 用のユーザースクリプトです。Recursive Portal の一覧を貼り付けると、Ingress Intel Map 上に「アノマリーエリア / Wave」ごとのレイヤーとして表示します。

## インストール

1. Tampermonkey などのユーザースクリプトマネージャーをインストールします。
2. `recursive-portal-waves.user.js` をユーザースクリプトとして追加します。
3. `https://intel.ingress.com/` を開き、IITC-CE が読み込まれている状態で Toolbox の `Recursive Waves` ボタンを押します。

対象 URL は `https://intel.ingress.com/*` です。

## 入力形式

1 行に 1 ポータルを入力します。コードと GUID の区切りには、タブ、連続空白、カンマを使えます。

```text
20260530KureeW1R10D001    1f02b59e7fbb3457be0643de5b004b3c.16
20260530KureeW1R10D002    c5f393280086371b87289eb66978acc8.16
20260530KureeW1R50D003    1d573615450c3006b514ac950de27443.16
```

コメント行は `#` または `//` で始めます。空行も無視されます。

コードは `^(.+)W(\d+)R(\d+)D(\d+)$` で解析します。

- `20260530Kuree`: アノマリーエリア
- `W1`: Wave
- `R10` / `R50`: リカーシブポイント
- `D001`: 表示番号
- 2 列目: Ingress ポータル GUID

GUID は `^[0-9a-f]{32}\.\d+$` に一致する必要があります。不正な行があっても、正常な行は読み込まれます。完全に同じコードと GUID の重複は無視します。

## できること

- `<Area> / W<Wave>` ごとに `L.layerGroup()` を作成し、`layerChooser.addOverlay()` に登録します。
- Wave ごとに色を変えます。
- マーカーに `D` 番号と `R` ポイントを表示します。
- `R50` 以上は大きめの二重枠と発光で強調します。
- マーカーをクリックすると、元の IITC ポータルマーカーへ click イベントを渡してポータル詳細を開きます。
- `mapDataRefreshEnd` のたびに、現在読み込まれている `window.portals[guid]` と再照合して再描画します。
- 入力内容は `localStorage` に保存され、IITC 再起動後も復元されます。
- ダイアログには未読込 GUID 件数と入力エラー件数を表示します。

## ダイアログのボタン

- `Apply`: 入力を保存し、レイヤーを作り直します。
- `現在のMAPで再照合`: 現在 Intel Map に読み込まれているポータルと再照合します。
- `表示済みポータルへ移動`: 描画済みマーカーの範囲へ地図を移動します。
- `全削除`: 保存済み入力と作成済みレイヤーを削除します。

## 制約

入力データには緯度・経度がないため、GUID だけでは未読込ポータルの座標は分かりません。この初版では Niantic サーバーへ大量の詳細リクエストを行わず、Intel Map 上で現在読み込まれている `window.portals[guid]` のみを描画します。

将来 `portalDetail.request(guid)` を使って詳細取得を追加する場合は、明示的な実行ボタン、低速キュー、重複排除、失敗時の停止、リクエスト上限を必ず実装してください。

## 開発チェック

```sh
node --check recursive-portal-waves.user.js
```
