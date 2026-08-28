const CACHE = 'portal-gr-v6';
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
