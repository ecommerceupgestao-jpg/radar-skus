/**
 * Radar de SKUs — backend no Google Apps Script
 * Lê a aba "Visão Geral" da planilha "Fluxo de saída por SKU", guarda o histórico
 * diário e as anotações numa planilha própria ("Radar de SKUs – dados") e serve
 * tudo em JSON para o site no GitHub Pages.
 *
 * Instalação: veja o README do projeto. Resumo:
 *   1. Troque a SENHA abaixo.
 *   2. Rode a função instalar() uma vez (autorize o acesso).
 *   3. Implantar > Nova implantação > App da Web
 *      Executar como: Eu · Quem pode acessar: Qualquer pessoa
 *   4. Copie a URL /exec para o config.js do site.
 */

const CONFIG = {
  FONTE_ID: '1404SCPiabg6abXRphpHqGXQ0frRkIlUptDV9m8a-x3w', // planilha Fluxo de saída por SKU
  ABA_FONTE: 'Visão Geral',
  ABA_ATUALIZACAO: 'Dados_Base', // célula C2 traz "Atualizado em"
  SENHA: 'TROQUE-ESTA-SENHA',   // senha pedida no site (deixe '' para sem senha)
  HORA_DIARIA: 9,               // execução automática ~09:40 (horário de Brasília)
  MINUTO_DIARIO: 40,
  FUSO: 'America/Sao_Paulo',
};

const CAMPOS = ['sku','forn','cat','wms','any','d1','v7','v30','v60','v6m','v12m','inativo','imp','classe','fat','lucro','vol'];
const ALIASES = {
  forn:['fornecedor'], sku:['skus','sku'], cat:['categorias','categoria'], wms:['estoquewms'], any:['estoqueanymarket'],
  d1:['desdeontem'], v7:['ultimos7dias'], v30:['ultimos30dias'], v60:['ultimos60dias'], v6m:['ultimos6m'], v12m:['ultimos12m'],
  inativo:['inativo'], imp:['importacao'], classe:['classificacao'], fat:['faturamento'], lucro:['lucro'], vol:['volume'],
};
const CHUNK = 45000; // limite de ~50 mil caracteres por célula

/* ------------------------------------------------------------------ web */
function doGet(e) { return responder_(e, null); }
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return responder_(e, body);
}
function responder_(e, body) {
  const p = Object.assign({}, (e && e.parameter) || {}, body || {});
  if (CONFIG.SENHA && p.key !== CONFIG.SENHA) return json_({ erro: 'chave' });
  try {
    switch (p.action) {
      case 'data': return json_(dados_());
      case 'sku':  return json_(historicoSku_(String(p.sku || '')));
      case 'run':  registrarDia_('manual'); return json_(dados_());
      case 'nota': salvarNota_(p); return json_({ notas: lerNotas_() });
      default:     return json_({ erro: 'acao', mensagem: 'Ação desconhecida.' });
    }
  } catch (err) {
    return json_({ erro: 'falha', mensagem: String(err && err.message || err) });
  }
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------ instalação */
function instalar() {
  store_(); // cria a planilha de dados se não existir
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'execucaoDiaria')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('execucaoDiaria').timeBased().everyDays(1)
    .atHour(CONFIG.HORA_DIARIA).nearMinute(CONFIG.MINUTO_DIARIO).inTimezone(CONFIG.FUSO).create();
  registrarDia_('manual');
  Logger.log('Pronto. Planilha de dados: ' + store_().getUrl());
}
function execucaoDiaria() { registrarDia_('auto'); }

function store_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('STORE_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('Radar de SKUs – dados');
    props.setProperty('STORE_ID', ss.getId());
    const h = ss.getSheets()[0]; h.setName('Historico'); h.appendRow(['run', 'dia', 'stamp', 'fonte', 'json']);
    ss.insertSheet('Anotacoes').appendRow(['sku', 'tags', 'texto', 'lembrar', 'atualizado', 'por']);
  }
  return ss;
}

/* ------------------------------------------------------------ leitura */
function norm_(s) {
  return String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function num_(v) {
  if (typeof v === 'number') return Math.round(v);
  const s = String(v == null ? '' : v).trim().replace(/%/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return isFinite(n) ? Math.round(n) : 0;
}
function bool_(v) { return v === true || String(v).toUpperCase() === 'TRUE' ? 1 : 0; }

function lerFonte_() {
  const ss = SpreadsheetApp.openById(CONFIG.FONTE_ID);
  const sh = ss.getSheetByName(CONFIG.ABA_FONTE);
  if (!sh) throw new Error('Aba "' + CONFIG.ABA_FONTE + '" não encontrada.');
  const vals = sh.getDataRange().getValues();
  let hr = vals.findIndex(r => r.some(c => norm_(c) === 'skus'));
  if (hr < 0) hr = 0;
  const head = vals[hr].map(norm_), idx = {};
  Object.keys(ALIASES).forEach(k => { idx[k] = head.findIndex(h => ALIASES[k].indexOf(h) >= 0); });
  if (idx.sku < 0 || idx.v7 < 0) throw new Error('A aba Visão Geral mudou de formato (colunas SKUs / últimos 7 dias).');
  const g = (r, k) => (idx[k] >= 0 ? r[idx[k]] : '');
  const rows = [];
  for (let i = hr + 1; i < vals.length; i++) {
    const r = vals[i], sku = String(g(r, 'sku') || '').trim();
    if (!sku) continue;
    const x = [sku, String(g(r,'forn')||'').trim(), String(g(r,'cat')||'').trim(),
      num_(g(r,'wms')), num_(g(r,'any')), num_(g(r,'d1')), num_(g(r,'v7')), num_(g(r,'v30')),
      num_(g(r,'v60')), num_(g(r,'v6m')), num_(g(r,'v12m')), bool_(g(r,'inativo')), bool_(g(r,'imp')),
      String(g(r,'classe')||'').trim(), String(g(r,'fat')||'').trim(), String(g(r,'lucro')||'').trim(), String(g(r,'vol')||'').trim()];
    if (x[3] || x[4] || x[10] || !x[11]) rows.push(x);
  }
  let atualizado = '';
  try {
    const b = ss.getSheetByName(CONFIG.ABA_ATUALIZACAO);
    const v = b && b.getRange('C2').getValue();
    atualizado = v instanceof Date ? Utilities.formatDate(v, CONFIG.FUSO, 'dd/MM/yyyy HH:mm') : String(v || '');
  } catch (e) {}
  return { rows, atualizado };
}

function dados_() {
  const f = lerFonte_();
  const h = store_().getSheetByName('Historico'), n = h.getLastRow();
  let ultima = '', fonte = '';
  if (n > 1) { const r = h.getRange(n, 1, 1, 4).getValues()[0]; ultima = String(r[2]); fonte = String(r[3]); }
  return {
    meta: { stamp: f.atualizado || agora_(), ultima, fonte },
    campos: CAMPOS, rows: f.rows, notas: lerNotas_(),
  };
}

/* ------------------------------------------------------------ histórico */
function agora_() { return Utilities.formatDate(new Date(), CONFIG.FUSO, 'dd/MM/yyyy HH:mm'); }
function hoje_() { return Utilities.formatDate(new Date(), CONFIG.FUSO, 'yyyy-MM-dd'); }
function ontem_(iso) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function registrarDia_(fonte) {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const f = lerFonte_(), d = {};
    f.rows.forEach(x => { if (x[5] || x[3]) d[x[0]] = [x[5], x[3]]; });
    const txt = JSON.stringify(d), partes = [];
    for (let i = 0; i < txt.length; i += CHUNK) partes.push(txt.slice(i, i + CHUNK));
    const run = hoje_(), linha = [run, ontem_(run), agora_(), fonte].concat(partes);
    const h = store_().getSheetByName('Historico'), n = h.getLastRow();
    let alvo = 0;
    if (n > 1) {
      const runs = h.getRange(2, 1, n - 1, 1).getDisplayValues().map(r => r[0]);
      const i = runs.lastIndexOf(run); if (i >= 0) alvo = i + 2;
    }
    if (alvo) {
      const larg = Math.max(h.getLastColumn(), linha.length);
      h.getRange(alvo, 1, 1, larg).clearContent();
      h.getRange(alvo, 1, 1, linha.length).setNumberFormat('@').setValues([linha]);
    } else {
      h.getRange(n + 1, 1, 1, linha.length).setNumberFormat('@').setValues([linha]);
    }
  } finally { lock.releaseLock(); }
}

function historicoSku_(sku) {
  const h = store_().getSheetByName('Historico'), n = h.getLastRow();
  if (n < 2 || !sku) return { dias: [], inicio: '' };
  const ini = Math.max(2, n - 399), vals = h.getRange(ini, 1, n - ini + 1, h.getLastColumn()).getDisplayValues();
  const dias = [];
  vals.forEach(r => {
    const txt = r.slice(4).join('');
    if (!txt) return;
    let d; try { d = JSON.parse(txt); } catch (e) { return; }
    const v = d[sku];
    dias.push([r[1], v ? v[0] : 0, v ? v[1] : 0]);
  });
  dias.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return { dias, inicio: dias.length ? dias[0][0] : '' };
}

/* ------------------------------------------------------------ anotações */
function lerNotas_() {
  const sh = store_().getSheetByName('Anotacoes'), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 6).getDisplayValues().filter(r => r[0]).map(r => ({
    sku: r[0], tags: r[1] ? r[1].split('|') : [], texto: r[2], lembrar: r[3], atualizado: r[4], por: r[5],
  }));
}
function salvarNota_(p) {
  const sku = String(p.sku || '').trim();
  if (!sku) throw new Error('SKU vazio.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = store_().getSheetByName('Anotacoes'), n = sh.getLastRow();
    const skus = n > 1 ? sh.getRange(2, 1, n - 1, 1).getDisplayValues().map(r => r[0]) : [];
    const i = skus.indexOf(sku), row = i >= 0 ? i + 2 : 0;
    if (p.apagar) { if (row) sh.deleteRow(row); return; }
    const tags = (Array.isArray(p.tags) ? p.tags : []).map(String).join('|');
    const lembrar = /^\d{4}-\d{2}-\d{2}$/.test(String(p.lembrar || '')) ? String(p.lembrar) : '';
    const linha = [sku, tags, String(p.texto || '').slice(0, 2000), lembrar, String(p.atualizado || agora_()), String(p.por || '').slice(0, 60)];
    const alvo = row || n + 1;
    sh.getRange(alvo, 1, 1, 6).setNumberFormat('@').setValues([linha]);
  } finally { lock.releaseLock(); }
}
