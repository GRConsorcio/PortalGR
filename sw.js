const CACHE = 'portal-gr-v8';
const SHELL = ['./', './index.html', './manifest.json', './logo.svg', './icon.svg?v=3'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // BUGFIX: interceptar TUDO (inclusive chamadas cross-origin pro Supabase)
  // fazia telas com fallback silencioso (organograma, regras de curso etc.)
  // caírem no cache/erro em vez de pegar o dado real — só o app instalado
  // (PWA) parecia afetado porque é onde o SW realmente controla o fetch.
  // Agora só a casca do app (mesmo origin) passa por aqui; tudo cross-origin
  // (Supabase, fontes, CDNs) vai direto pra rede, sem passar pelo SW.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  // BUGFIX: fetch(e.request) sem opções podia devolver uma resposta do cache
  // HTTP do próprio navegador (não do cache do SW) se o servidor mandasse
  // Cache-Control permissivo — reload mostrava por um instante o HTML/JS
  // antigo (ex: sidebar de nível com "pts" de uma versão anterior) até algo
  // forçar um re-render com o código novo. 'reload' força ir na rede de
  // verdade, ignorando o cache HTTP; só cai no cache do SW (catch) se a rede
  // falhar de fato (offline).
  e.respondWith(
    fetch(e.request, {cache:'reload'}).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// Web Push: chega mesmo com o Portal FECHADO (enviado pela Edge Function enviar-push quando o banco cria uma
// notificação pra essa pessoa). Se o Portal já está aberto e em foco, ele mesmo avisa em tempo real (balão no app) —
// mostrar também um aviso do sistema só duplicaria; a "tag" igual à que o Portal usa faz um substituir o outro.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { titulo: 'GR Portal', corpo: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (janelas.some((c) => c.focused && c.visibilityState === 'visible')) return;
    await self.registration.showNotification(d.titulo || 'GR Portal', {
      body: d.corpo || '',
      icon: './icon.svg?v=3',
      badge: './icon.svg?v=3',
      tag: d.tag || undefined,
      renotify: !!d.tag,
      data: { notifId: d.notifId, tipo: d.tipo, ref_id: d.ref_id, ref_extra: d.ref_extra },
    });
  })());
});

// Clique numa notificação do sistema (mensagem, menção, comentário...): se o Portal já está aberto, traz a janela
// pra frente e manda o id da notificação pra ele navegar até a conversa/publicação; se estiver fechado, abre já
// com #notif=<id> e o próprio Portal resolve o destino depois de logar (ver _abrirNotifDoHash no index.html).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((c) => c.url.startsWith(self.location.origin));
    if (aberta) {
      await aberta.focus();
      if (data.notifId) aberta.postMessage({ type: 'notif-click', notifId: data.notifId });
      return;
    }
    await self.clients.openWindow('./index.html' + (data.notifId ? '#notif=' + encodeURIComponent(data.notifId) : ''));
  })());
});
