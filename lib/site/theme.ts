// テーマの初期適用スクリプト。ペイント前に<script>で流し込む(FOUC防止)。
// (site)レイアウト・not-found・global-errorの3画面が同じものを使う。
// かつては3箇所に写しを置いていて、既定を変えたとき片方だけに入る事故が起きた
// (サイト本体はダーク既定、エラーページ2枚はライト既定のまま放置)。ここが唯一の出所。
//
// 既定は時刻で決める(2026-08-27 Andy指定)。6:01〜17:00はライト、17:01〜6:00はダーク。
// 境目は「6:00はまだ夜、17:00はまだ昼」。
//
// 見るのは閲覧者の端末時計。日本の読者には指定どおりの時刻で切り替わり、
// 時差のある場所から見ても「その人の昼は明るく、夜は暗い」になる。
// 手で切り替えた人はその選択が残る(localStorageのandy-theme)。OSの配色設定は見ない。
//
// サーバー側で決めるとHTMLのキャッシュに時刻が焼き付いて固定されるため、
// 判定は必ずブラウザ側で毎回やる。
export const THEME_INIT = `var t;try{t=localStorage.getItem('andy-theme')}catch(e){}var n=new Date(),m=n.getHours()*60+n.getMinutes();if(t==='dark'||(t!=='light'&&(m<361||m>1020)))document.documentElement.dataset.theme='dark'`
