import './style.css';
import './auth.css';
import { auth, initializeAuth, readerName, accessToken, login, logout } from './auth';

interface Book { id: string; title: string; author: string }
interface Loan { id: string; bookId: string; readerName: string; createdAt: string }
interface Notification { eventId: string; loanId: string; readerName: string; message: string; processedAt: string }
const LIBRARY_API = 'http://localhost:3001';
const NOTIFICATIONS_API = 'http://localhost:8004';
const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <header><a class="brand" href="/" aria-label="Biblioteca, início"><span class="brand-mark">B<span>↗</span></span> biblioteca<span class="brand-dot">.</span></a><div class="auth-controls"><span id="session-name" class="muted">Conectando ao login…</span><button id="session-button" class="text-button" type="button" disabled>Entrar</button></div></header>
  <main>
    <section class="intro"><div><p class="eyebrow">SEU PRÓXIMO CAPÍTULO</p><h1>Uma boa história<br>começa por aqui<span>.</span></h1><p class="intro-copy">Explore o catálogo, escolha sua leitura e registre seu empréstimo.</p></div><div class="intro-detail"><span class="number">01 — 03</span><p>Clássicos brasileiros.<br>Histórias para levar com você.</p><span class="intro-arrow" aria-hidden="true">↙</span></div></section>
    <section aria-labelledby="catalog-title"><div class="section-heading"><div><p class="eyebrow">EXPLORE A ESTANTE</p><h2 id="catalog-title">Catálogo de livros</h2></div><span id="book-count" class="muted">Carregando catálogo…</span></div><p id="catalog-error" class="error" role="alert" hidden></p><div id="books" class="book-grid"></div></section>
    <section class="activity" aria-labelledby="activity-title"><div class="section-heading"><div><p class="eyebrow">ACOMPANHE SUA LEITURA</p><h2 id="activity-title">Empréstimos & notificações</h2></div><button id="refresh" class="text-button" type="button">Atualizar ↻</button></div><p class="activity-note">Após o empréstimo, a confirmação aparece aqui assim que for processada.</p><p id="activity-error" class="error" role="alert" hidden></p><div id="loans" aria-live="polite"></div><p id="updated" class="muted update-note"></p></section>
  </main>
  <footer><span class="brand-small">biblioteca.</span><span>Um livro. Muitas possibilidades.</span></footer>
  <dialog id="loan-dialog"><form id="loan-form"><div class="dialog-heading"><p class="eyebrow">NOVA LEITURA</p><button id="close-dialog" class="close" type="button" aria-label="Fechar">×</button></div><h2>Solicitar empréstimo</h2><p id="selected-title" class="selected-title"></p><label for="reader-name">Leitor autenticado</label><input id="reader-name" name="readerName" readonly /><p id="form-error" class="error" role="alert" hidden></p><button id="submit" class="primary-button" type="submit">Confirmar empréstimo <span>↗</span></button><p class="dialog-note">A identidade é confirmada pela API a partir do seu login.</p></form></dialog>
  <div id="toast" role="status" hidden></div>`;

let books: Book[] = [];
let selected: Book | undefined;
let loading = false;
let submitting = false;
let toastTimer: ReturnType<typeof setTimeout>;
const dialog = document.querySelector<HTMLDialogElement>('#loan-dialog')!;
const form = document.querySelector<HTMLFormElement>('#loan-form')!;
const submit = document.querySelector<HTMLButtonElement>('#submit')!;
const reader = document.querySelector<HTMLInputElement>('#reader-name')!;
function escape(value: string) { return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
function message(id: string, text: string) { const el = document.getElementById(id)!; el.textContent = text; el.hidden = !text; }
function date(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
class ApiError extends Error { constructor(message: string, public readonly loanId?: string) { super(message); } }
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    const token = url === `${LIBRARY_API}/books` ? undefined : await accessToken();
    const headers = new Headers(options?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(15000) });
  }
  catch { throw new ApiError(options?.method === 'POST' ? 'Não foi possível confirmar o resultado. Consulte a lista antes de tentar novamente.' : 'Não foi possível conectar ao serviço. Verifique se ele está em execução.'); }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new ApiError(options?.method === 'POST'
    ? 'O serviço retornou uma resposta inválida. Consulte a lista antes de tentar novamente.'
    : 'O serviço retornou uma resposta inválida. Tente atualizar a lista.'); }
  if (!response.ok) {
    const failure = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const text = typeof failure.message === 'string' ? failure.message : typeof failure.detail === 'string' ? failure.detail : 'Não foi possível concluir a operação.';
    throw new ApiError(text, typeof failure.loanId === 'string' ? failure.loanId : undefined);
  }
  return data as T;
}
function toast(text: string) { clearTimeout(toastTimer); message('toast', text); toastTimer = setTimeout(() => message('toast', ''), 6500); }

async function loadBooks() {
  try {
    books = await request<Book[]>(`${LIBRARY_API}/books`);
    message('catalog-error', '');
    document.getElementById('book-count')!.textContent = `${books.length} títulos no catálogo`;
    const colors = ['olive', 'rust', 'cream'];
    document.getElementById('books')!.innerHTML = books.map((book, index) => `
      <article class="book-card"><div class="cover ${colors[index % 3]}" aria-hidden="true"><span class="cover-author">${escape(book.author)}</span><span class="cover-title">${escape(book.title)}</span><span class="cover-bottom">LITERATURA BRASILEIRA <span>✳</span></span></div><div class="book-info"><span class="book-category">CLÁSSICO BRASILEIRO</span><h3>${escape(book.title)}</h3><p>${escape(book.author)}</p><button class="borrow" data-book="${escape(book.id)}" type="button">Solicitar empréstimo <span>↗</span></button></div></article>`).join('');
    if (!books.length) document.getElementById('books')!.textContent = 'Nenhum livro cadastrado.';
  } catch (error) { message('catalog-error', (error as Error).message); document.getElementById('book-count')!.textContent = 'Catálogo indisponível'; }
}

async function loadActivity() {
  if (!auth.authenticated || !auth.hasRealmRole('leitor')) {
    message('activity-error', '');
    document.getElementById('loans')!.textContent = auth.authenticated ? 'Seu usuário não tem permissão de leitor. Entre com outra conta para solicitar empréstimos.' : 'Entre na sua conta para consultar seus empréstimos e notificações.';
    document.getElementById('updated')!.textContent = '';
    return;
  }
  if (loading) return;
  const sessionId = auth.subject;
  loading = true;
  const refresh = document.querySelector<HTMLButtonElement>('#refresh')!;
  refresh.disabled = true;
  try {
    const [loansResult, notificationsResult] = await Promise.allSettled([
      request<Loan[]>(`${LIBRARY_API}/loans`), request<Notification[]>(`${NOTIFICATIONS_API}/notifications`),
    ]);
    // Uma consulta iniciada antes da perda de sessão não deve repor dados privados na tela.
    if (!auth.authenticated || auth.subject !== sessionId) return;
    if (loansResult.status === 'rejected') throw loansResult.reason;
    const notifications = notificationsResult.status === 'fulfilled' ? notificationsResult.value : [];
    const loans = loansResult.value;
    message('activity-error', notificationsResult.status === 'rejected' ? 'Empréstimos carregados. O serviço de notificações está indisponível; atualizaremos quando ele voltar.' : '');
    const container = document.getElementById('loans')!;
    container.innerHTML = loans.length ? loans.map(loan => {
      const notification = notifications.find(item => item.loanId === loan.id);
      const book = books.find(item => item.id === loan.bookId);
      return `<article class="loan-row"><span class="loan-icon" aria-hidden="true">↗</span><div class="loan-main"><h3>${escape(book?.title ?? 'Livro emprestado')}</h3><p>${escape(loan.readerName)} <span>·</span> ${date(loan.createdAt)}</p><details><summary>Identificador do empréstimo</summary><code>${escape(loan.id)}</code></details></div><div class="notification"><span class="badge ${notification ? 'confirmed' : 'pending'}">${notification ? '✓ Notificação registrada' : notificationsResult.status === 'rejected' ? 'Consulta indisponível' : '◷ Aguardando notificação'}</span><p>${notification ? escape(notification.message) : 'O empréstimo já foi registrado.'}</p></div></article>`;
    }).join('') : '<div class="empty"><span aria-hidden="true">↗</span><h3>Sua próxima leitura espera por você</h3><p>Escolha um livro no catálogo para registrar o primeiro empréstimo.</p></div>';
    document.getElementById('updated')!.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR')} · atualização automática a cada 3 segundos`;
  } catch (error) {
    if (auth.authenticated && auth.subject === sessionId) message('activity-error', (error as Error).message);
  }
  finally { loading = false; refresh.disabled = false; }
}

document.getElementById('books')!.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-book]');
  if (!button) return;
  if (!auth.authenticated) { void login().catch(() => toast('Não foi possível abrir o serviço de login.')); return; }
  if (!auth.hasRealmRole('leitor')) { toast('Seu usuário não tem o papel de leitor.'); return; }
  selected = books.find(book => book.id === button.dataset.book);
  if (!selected) return;
  document.getElementById('selected-title')!.textContent = selected.title;
  reader.value = readerName();
  message('form-error', ''); dialog.showModal(); submit.focus();
});
document.getElementById('close-dialog')!.addEventListener('click', () => { if (!submitting) dialog.close(); });
dialog.addEventListener('cancel', event => { if (submitting) event.preventDefault(); });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!selected || submitting) return;
  if (reader.value.trim().length < 2) { message('form-error', 'Informe um nome com pelo menos 2 caracteres.'); return; }
  submitting = true; submit.disabled = true; submit.textContent = 'Registrando…'; message('form-error', '');
  try {
    await request<Loan>(`${LIBRARY_API}/loans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookId: selected.id }) });
    dialog.close(); form.reset(); toast('Empréstimo registrado! Acompanhe a notificação abaixo.');
  } catch (error) {
    const failure = error as ApiError;
    if (failure.loanId) { dialog.close(); toast(failure.message); }
    else message('form-error', failure.message);
  } finally { submitting = false; submit.disabled = false; submit.innerHTML = 'Confirmar empréstimo <span>↗</span>'; await loadActivity(); }
});
document.getElementById('refresh')!.addEventListener('click', () => { void loadBooks().then(loadActivity); });
const sessionButton = document.querySelector<HTMLButtonElement>('#session-button')!;
function renderSession() {
  document.getElementById('session-name')!.textContent = auth.authenticated ? `${readerName()}${auth.hasRealmRole('bibliotecario') ? ' · Bibliotecário' : ''}` : 'Catálogo público';
  sessionButton.textContent = auth.authenticated ? 'Sair' : 'Entrar';
}
auth.onAuthLogout = () => {
  renderSession();
  dialog.close();
  form.reset();
  void loadActivity();
};
sessionButton.addEventListener('click', () => {
  void (auth.authenticated ? logout() : login()).catch(() => toast('Não foi possível abrir o serviço de login.'));
});
try {
  await initializeAuth();
  renderSession();
} catch {
  document.getElementById('session-name')!.textContent = 'Login indisponível';
  toast('Não foi possível conectar ao Keycloak. O catálogo continua público.');
}
sessionButton.disabled = false;
await loadBooks();
await loadActivity();
setInterval(() => { if (!document.hidden) void loadActivity(); }, 3000);
