'use strict';

(() => {
  const STORE_KEY = 'estudo-bass-v1';
  const STRINGS = [
    { name: 'G', openMidi: 55 },
    { name: 'D', openMidi: 50 },
    { name: 'A', openMidi: 45 },
    { name: 'E', openMidi: 40 },
    { name: 'B', openMidi: 35 }
  ];
  const NOTE_NAMES = ['Dó', 'Dó♯', 'Ré', 'Ré♯', 'Mi', 'Fá', 'Fá♯', 'Sol', 'Sol♯', 'Lá', 'Lá♯', 'Si'];
  const KEYS = ['Dó', 'Dó♯/Ré♭', 'Ré', 'Ré♯/Mi♭', 'Mi', 'Fá', 'Fá♯/Sol♭', 'Sol', 'Sol♯/Lá♭', 'Lá', 'Lá♯/Si♭', 'Si'];
  const GROUPS = [{ id: 'adolescentes', label: 'Adolescentes', short: 'Adolescentes', target: 3, countId: 'groupCountTeens' }, { id: 'jovens', label: 'Jovens', short: 'Jovens', target: 3, countId: 'groupCountYouth' }, { id: 'senhoras', label: 'Senhoras', short: 'Senhoras', target: 3, countId: 'groupCountLadies' }, { id: 'louvor', label: 'Ministério de louvor', short: 'Louvor', target: 5, countId: 'groupCountWorship' }];
  const ICON_PLAY = '<svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg class="play-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  const ICON_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const ICON_UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>';
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 001 1h8a1 1 0 001-1l1-12M9 7V4h6v3"/></svg>';
  const $ = (id) => document.getElementById(id);
  const views = { library: $('libraryView'), editor: $('editorView'), study: $('studyView') };

  let songs = loadSongs();
  let editingId = null;
  let libraryGroupFilter = 'all';
  let draftPhrases = [];
  let editorMode = '';
  let composer = null;
  let studySongId = null;
  let isStageMode = false;
  let stageLineIndex = 0;
  let studySpeed = 0.75;
  let isPlaying = false;
  let animationFrame = 0;
  let lastFrame = 0;
  let scrollPosition = 0;
  let installPrompt = null;
  let toastTimer = 0;
  let stageRows = [];
  let stageRowByLine = new Map();
  let stagePositionByLine = new Map();
  let stagePhrases = [];
  let stageDisplayedPhrase = null;
  let stagePhraseHeading = null;
  let stagePhraseDistance = null;
  let stageEmptyRendered = false;
  let stageFocusFrame = 0;
  let lastStageFocusAt = 0;
  let searchRenderTimer = 0;
  let phraseLabelsFrame = 0;

  function makeId() {
    return (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'song-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function loadSongs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((song) => song && typeof song.id === 'string' && typeof song.title === 'string');
    } catch (error) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(songs));
      return true;
    } catch (error) {
      showToast('Não consegui salvar. Verifique o espaço do navegador.');
      return false;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function showView(name) {
    Object.keys(views).forEach((key) => views[key].classList.toggle('hidden', key !== name));
    document.body.dataset.view = name;
    closeMoreMenu();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name !== 'study') pauseStudy(false);
    $('stageView').classList.add('hidden');
    $('stageView').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('stage-mode');
    isStageMode = false;
  }

  function normalizedLyrics(text) {
    return String(text || '').replace(/\r\n?/g, '\n').split('\n');
  }

  function cleanTranscript(text) {
    return String(text || '').split(/\r\n?/).map((line) => line
      .replace(/^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?(?:\s*-->\s*(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d+)?)?\s*/, '')
      .replace(/<[^>]*>/g, '')
      .trim())
      .filter((line) => line && !/^\d+$/.test(line) && !/^WEBVTT$/i.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
  }
  function nonEmptyLines(text) {
    return normalizedLyrics(text).map((text, index) => ({ text: text.trim(), index })).filter((line) => line.text);
  }

  function noteAt(stringIndex, fret) {
    const midi = STRINGS[stringIndex].openMidi + Number(fret || 0);
    return NOTE_NAMES[((midi % 12) + 12) % 12];
  }

  function uniqueSteps(steps) {
    const map = new Map();
    (steps || []).forEach((step) => {
      const key = step.string + ':' + step.fret;
      if (!map.has(key)) map.set(key, { string: step.string, fret: Number(step.fret), id: map.size + 1 });
    });
    return Array.from(map.values());
  }

  function boardWindow(steps, interactive) {
    if (interactive) return { a: 0, b: 12 };
    const frets = (steps || []).map((step) => Number(step.fret));
    if (!frets.length) return { a: 0, b: 5 };
    const min = Math.min(...frets);
    const max = Math.max(...frets);
    const a = min === 0 ? 0 : Math.max(1, min - 1);
    const b = Math.min(12, Math.max(max + 1, Math.max(a, 1) + 4));
    return { a, b };
  }

  function boardRangeLabel(steps) {
    const range = boardWindow(steps, false);
    return 'casas ' + range.a + '–' + range.b;
  }

  function fretboardSvg(steps, interactive) {
    const safeSteps = Array.isArray(steps) ? steps : [];
    const points = uniqueSteps(safeSteps);
    const { a, b } = boardWindow(safeSteps, interactive);
    const W = interactive ? 348 : 330;
    const sy = interactive ? 40 : 26;
    const r = 12;
    const labelW = 18;
    const openW = a === 0 ? 30 : 0;
    const left = labelW + openW;
    const first = Math.max(a, 1);
    const cells = b - first + 1;
    const right = W - 6;
    const sp = (right - left) / cells;
    const top = 18;
    const bottom = top + 4 * sy;
    const H = bottom + 34;
    const xFor = (fret) => Number(fret) === 0 ? labelW + openW / 2 : left + (Number(fret) - first + 0.5) * sp;
    const yFor = (string) => top + Number(string) * sy;
    const n = (value) => Math.round(value * 10) / 10;
    let svg = '<svg class="fretboard" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Braço de baixo de cinco cordas">';
    svg += '<rect class="fb-bg" x="' + left + '" y="' + (top - 10) + '" width="' + n(right - left) + '" height="' + (4 * sy + 20) + '" rx="6"/>';
    const middle = (top + bottom) / 2;
    [3, 5, 7, 9].forEach((fret) => {
      if (fret >= first && fret <= b) svg += '<circle class="fb-marker" cx="' + n(xFor(fret)) + '" cy="' + middle + '" r="4"/>';
    });
    if (12 >= first && 12 <= b) {
      svg += '<circle class="fb-marker" cx="' + n(xFor(12)) + '" cy="' + (top + 1.5 * sy) + '" r="4"/>';
      svg += '<circle class="fb-marker" cx="' + n(xFor(12)) + '" cy="' + (top + 2.5 * sy) + '" r="4"/>';
    }
    for (let k = 0; k <= cells; k += 1) {
      const x = n(left + k * sp);
      svg += '<line class="' + (k === 0 && a === 0 ? 'fb-nut' : 'fb-fret') + '" x1="' + x + '" y1="' + (top - 10) + '" x2="' + x + '" y2="' + (bottom + 10) + '"/>';
    }
    const stringStart = a === 0 ? labelW + 4 : left;
    STRINGS.forEach((string, index) => {
      const y = yFor(index);
      svg += '<line class="fb-string" x1="' + stringStart + '" y1="' + y + '" x2="' + right + '" y2="' + y + '" stroke-width="' + n(1 + index * 0.4) + '"/>';
      svg += '<text class="string-label" x="7" y="' + (y + 3.5) + '">' + string.name + '</text>';
    });
    for (let fret = first; fret <= b; fret += 1) {
      if (interactive || fret === first || fret === b || [3, 5, 7, 9, 12].includes(fret)) {
        svg += '<text class="fret-label" x="' + n(xFor(fret)) + '" y="' + (bottom + 30) + '">' + fret + '</text>';
      }
    }
    if (a === 0) svg += '<text class="fret-label" x="' + (labelW + openW / 2) + '" y="' + (bottom + 30) + '">0</text>';
    if (interactive) {
      STRINGS.forEach((string, row) => {
        const y = yFor(row) - sy / 2;
        svg += '<rect class="fret-zone" x="' + labelW + '" y="' + y + '" width="' + openW + '" height="' + sy + '" data-string="' + row + '" data-fret="0" tabindex="0" role="button" aria-label="Corda ' + string.name + ', solta"/>';
        for (let fret = 1; fret <= 12; fret += 1) {
          svg += '<rect class="fret-zone" x="' + n(left + (fret - 1) * sp) + '" y="' + y + '" width="' + n(sp) + '" height="' + sy + '" data-string="' + row + '" data-fret="' + fret + '" tabindex="0" role="button" aria-label="Corda ' + string.name + ', casa ' + fret + '"/>';
        }
      });
    }
    for (let index = 0; index < safeSteps.length - 1; index += 1) {
      const from = { x: xFor(safeSteps[index].fret), y: yFor(safeSteps[index].string) };
      const to = { x: xFor(safeSteps[index + 1].fret), y: yFor(safeSteps[index + 1].string) };
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < r * 2 + 8) continue;
      const ux = dx / length;
      const uy = dy / length;
      const x1 = from.x + ux * (r + 3);
      const y1 = from.y + uy * (r + 3);
      const x2 = to.x - ux * (r + 4);
      const y2 = to.y - uy * (r + 4);
      const ax = x2 + ux * 3;
      const ay = y2 + uy * 3;
      svg += '<line class="fret-route" x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '"/>';
      svg += '<polygon class="fret-arrow" points="' + n(ax) + ',' + n(ay) + ' ' + n(ax - ux * 7 - uy * 4) + ',' + n(ay - uy * 7 + ux * 4) + ' ' + n(ax - ux * 7 + uy * 4) + ',' + n(ay - uy * 7 - ux * 4) + '"/>';
    }
    points.forEach((point) => {
      const x = n(xFor(point.fret));
      const y = yFor(point.string);
      const open = point.fret === 0;
      const label = noteAt(point.string, point.fret);
      svg += '<circle class="fret-dot' + (open ? ' open' : '') + '" cx="' + x + '" cy="' + y + '" r="' + r + '"/>';
      svg += '<text class="fret-dot-label' + (open ? ' open' : '') + (label.length > 3 ? ' small' : '') + '" x="' + x + '" y="' + y + '"' + '>' + escapeHtml(label) + '</text>';
    });
    if (interactive && safeSteps.length === 0) {
      svg += '<text class="fb-hint" x="' + n((left + right) / 2) + '" y="' + (middle - sy / 2 + 4) + '">Toque em uma casa para começar</text>';
    }
    svg += '</svg>';
    return svg;
  }

  function sequenceMarkup(steps, showPending) {
    if (!steps || !steps.length) return '<span class="sequence-empty">Ainda sem notas. Toque no braço na ordem da frase.</span>';
    const chips = steps.map((step, index) => {
      const label = noteAt(step.string, step.fret);
      return (index ? '<span class="sequence-arrow" aria-hidden="true">→</span>' : '') + '<span class="sequence-chip"><b>' + (index + 1) + '</b>' + escapeHtml(label) + '<small>' + STRINGS[step.string].name + step.fret + '</small></span>';
    }).join('');
    return chips + (showPending ? '<span class="sequence-arrow" aria-hidden="true">→</span><span class="sequence-chip pending">próxima nota</span>' : '');
  }

  function compactSequence(steps) {
    return (steps || []).map((step) => noteAt(step.string, step.fret)).join(' → ');
  }

  function populateKeys(selected) {
    $('songKey').innerHTML = '<option value="">Escolha o tom</option>' + KEYS.map((key) =>
      '<option value="' + escapeHtml(key) + '">' + escapeHtml(key) + '</option>'
    ).join('');
    $('songKey').value = selected || '';
  }

  function groupLabel(groupId) {
    return (GROUPS.find((group) => group.id === groupId) || {}).label || 'Sem grupo';
  }

  function groupShortLabel(groupId) {
    return (GROUPS.find((group) => group.id === groupId) || {}).short || 'Sem grupo';
  }

  function songMode(song) {
    return song.studyMode || (song.lyrics ? 'lyrics' : 'cues');
  }

  function renderLibrary() {
    if (searchRenderTimer) {
      window.clearTimeout(searchRenderTimer);
      searchRenderTimer = 0;
    }
    const query = $('searchInput').value.trim().toLocaleLowerCase('pt-BR');
    const groupMatches = songs.filter((song) => libraryGroupFilter === 'all' || song.group === libraryGroupFilter);
    const matches = groupMatches.filter((song) => song.title.toLocaleLowerCase('pt-BR').includes(query));
    const usedGroups = GROUPS.filter((group) => songs.some((song) => song.group === group.id)).length;
    $('songCount').textContent = songs.length === 0
      ? 'Nenhuma música ainda'
      : songs.length + (songs.length === 1 ? ' música cadastrada' : ' músicas cadastradas') + (usedGroups ? ' em ' + usedGroups + (usedGroups === 1 ? ' grupo' : ' grupos') : '');
    $('groupCountAll').textContent = String(songs.length);
    GROUPS.forEach((group) => {
      $(group.countId).textContent = String(songs.filter((song) => song.group === group.id).length);
    });
    $('groupFilters').querySelectorAll('[data-group]').forEach((button) => {
      const active = button.dataset.group === libraryGroupFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const isEmpty = songs.length === 0;
    $('emptyState').classList.toggle('hidden', !isEmpty);
    $('libraryTools').classList.toggle('hidden', isEmpty);
    $('libraryBar').classList.toggle('hidden', isEmpty);
    $('songsGrid').classList.toggle('hidden', isEmpty);
    if (!isEmpty && matches.length === 0) {
      const groupName = libraryGroupFilter === 'all' ? '' : ' em ' + groupLabel(libraryGroupFilter);
      $('songsGrid').innerHTML = '<div class="no-results"><h2>Nenhuma música encontrada' + escapeHtml(groupName) + '</h2><p>Tente outro nome ou escolha outro grupo.</p></div>';
    } else {
      $('songsGrid').innerHTML = matches.map((song) => {
        const phraseCount = (song.phrases || []).length;
        const modeLabel = songMode(song) === 'cues' ? 'Chamadas' : 'Letra';
        const key = (song.key || '—').split('/')[0];
        return '<button class="song-row" type="button" data-action="study" data-id="' + escapeHtml(song.id) + '"><span class="key-tile' + (key.length > 3 ? ' long' : '') + '"><strong>' + escapeHtml(key) + '</strong><span>TOM</span></span><span class="song-copy"><span class="song-title">' + escapeHtml(song.title) + '</span><span class="song-info">' + escapeHtml(groupShortLabel(song.group)) + ' · ' + phraseCount + (phraseCount === 1 ? ' frase' : ' frases') + ' · ' + modeLabel + '</span></span>' + ICON_CHEVRON + '</button>';
      }).join('');
    }
    $('exportButton').disabled = isEmpty;
  }


  function scheduleLibraryRender() {
    if (searchRenderTimer) window.clearTimeout(searchRenderTimer);
    searchRenderTimer = window.setTimeout(() => {
      searchRenderTimer = 0;
      renderLibrary();
    }, 100);
  }

  function openEditor(song) {
    editingId = song ? song.id : null;
    draftPhrases = song ? structuredClone(song.phrases || []) : [];
    composer = null;
    renderComposer();
    $('editorHeading').textContent = song ? 'Editar música' : 'Nova música';
    $('songTitle').value = song ? song.title : '';
    populateKeys(song ? song.key : '');
    $('songUrl').value = song ? song.url || '' : '';
    $('songGroup').value = song ? song.group || '' : '';
    $('songLyrics').value = song ? song.lyrics || '' : '';
    editorMode = song ? songMode(song) : 'cues';
    document.querySelectorAll('input[name="studyMode"]').forEach((input) => { input.checked = input.value === editorMode; });
    $('deleteSongButton').classList.toggle('hidden', !song);
    applyEditorMode();
    showView('editor');
  }

  function applyEditorMode() {
    const lyricsMode = editorMode === 'lyrics';
    $('lyricsFields').classList.toggle('hidden', !lyricsMode);
    $('modeHint').textContent = lyricsMode
      ? 'A letra rola e cada frase aparece na linha marcada.'
      : 'Uma chamada curta por frase, sem colar a letra. Cadastre na ordem da música.';
    $('phraseModeHint').textContent = lyricsMode
      ? 'Cada desenho fica ligado à sua linha da letra.'
      : 'Escreva uma chamada curta e monte o desenho.';
    if (composer) renderComposer();
    renderPhraseList();
  }

  function renderPhraseList() {
    const list = $('phraseList');
    if (!draftPhrases.length) {
      list.innerHTML = '<div class="empty-phrases">Ainda não há frases nesta música. Você pode adicionar quantas precisar.</div>';
      return;
    }
    const lines = normalizedLyrics($('songLyrics').value);
    list.innerHTML = draftPhrases.map((phrase, index) => {
      const line = (lines[phrase.lineIndex] || '').trim();
      const text = editorMode === 'lyrics'
        ? (line ? '“' + escapeHtml(line) + '”' : 'Linha ' + (Number(phrase.lineIndex) + 1))
        : escapeHtml(phrase.title || 'Frase do baixo');
      return '<article class="saved-phrase"><div class="saved-phrase-head"><span class="saved-phrase-num">FRASE ' + (index + 1) + '</span><span class="saved-phrase-line">' + text + '</span></div><div class="board-box">' + fretboardSvg(phrase.steps, false) + '</div><div class="sequence-chips">' + sequenceMarkup(phrase.steps, false) + '</div><div class="phrase-tools"><button type="button" data-phrase-action="edit" data-id="' + escapeHtml(phrase.id) + '">Editar</button><button type="button" data-phrase-action="delete" data-id="' + escapeHtml(phrase.id) + '">Remover</button></div></article>';
    }).join('');
  }


  function updatePhraseLineLabels() {
    if (editorMode !== 'lyrics') return;
    const lines = normalizedLyrics($('songLyrics').value);
    $('phraseList').querySelectorAll('.saved-phrase').forEach((card, index) => {
      const phrase = draftPhrases[index];
      const label = card.querySelector('.saved-phrase-line');
      if (!phrase || !label) return;
      const line = (lines[phrase.lineIndex] || '').trim();
      label.textContent = line ? '“' + line + '”' : 'Linha ' + (Number(phrase.lineIndex) + 1);
    });
  }

  function schedulePhraseLineLabels() {
    if (phraseLabelsFrame) return;
    phraseLabelsFrame = requestAnimationFrame(() => {
      phraseLabelsFrame = 0;
      updatePhraseLineLabels();
    });
  }

  function composerMarkup() {
    if (!composer) return '';
    const lines = nonEmptyLines($('songLyrics').value);
    const linePicker = lines.length
      ? lines.map((line) => '<option value="' + line.index + '"' + (line.index === composer.lineIndex ? ' selected' : '') + '>Linha ' + (line.index + 1) + ' · ' + escapeHtml(line.text.slice(0, 62)) + (line.text.length > 62 ? '…' : '') + '</option>').join('')
      : '<option value="-1">Adicione a letra para escolher uma linha</option>';
    const anchorField = editorMode === 'lyrics'
      ? '<label class="field"><span>Entra na linha</span><span class="select-wrap"><select id="phraseLine">' + linePicker + '</select></span></label>'
      : '';
    const titleLabel = editorMode === 'lyrics' ? 'Nome desta frase' : 'Chamada curta';
    const titlePlaceholder = editorMode === 'lyrics' ? 'Ex.: Entrada do refrão' : 'Ex.: depois da 2ª linha do refrão';
    const existingIndex = composer.editId ? draftPhrases.findIndex((phrase) => phrase.id === composer.editId) : -1;
    const number = existingIndex >= 0 ? existingIndex + 1 : draftPhrases.length + 1;
    const count = composer.steps.length;
    return '<div class="composer-inner">'
      + '<div class="composer-bar"><button class="text-button" id="closeComposer" type="button">Cancelar</button><h2>Frase ' + number + '</h2><button class="text-button accent" id="savePhraseTop" type="button">Concluir</button></div>'
      + '<div class="composer-body">'
      + anchorField
      + '<label class="field"><span>' + titleLabel + '</span><input id="phraseTitle" maxlength="80" value="' + escapeHtml(composer.title) + '" placeholder="' + titlePlaceholder + '"></label>'
      + '<section class="card board-card" aria-label="Braço do baixo, toque nas casas"><div class="board-card-head"><strong>Toque as casas na ordem</strong><span>casas 0–12</span></div><div id="composerBoard">' + fretboardSvg(composer.steps, true) + '</div></section>'
      + '<section class="sequence-section"><div class="sequence-head"><span>SEQUÊNCIA · ' + count + (count === 1 ? ' NOTA' : ' NOTAS') + '</span><div><button class="quiet-button" id="undoNote" type="button">' + ICON_UNDO + 'Desfazer</button><button class="quiet-button" id="clearNotes" type="button">' + ICON_TRASH + 'Limpar</button></div></div><div class="sequence-chips">' + sequenceMarkup(composer.steps, count > 0) + '</div></section>'
      + '<p class="composer-tip">Os nomes das notas e as setas da sequência aparecem sozinhos. Casa 0 é a corda solta. Repetir a casa registra o retorno.</p>'
      + '</div></div>'
      + '<div class="bottom-bar"><button class="primary-button wide" id="savePhrase" type="button">' + (composer.editId ? 'Salvar alterações' : 'Adicionar frase') + '</button></div>';
  }


  function renderComposerProgress() {
    if (!composer) return;
    const root = $('phraseComposer');
    const board = $('composerBoard');
    const sequence = root.querySelector('.sequence-section .sequence-chips');
    const label = root.querySelector('.sequence-head > span');
    if (!board || !sequence || !label) return;
    board.innerHTML = fretboardSvg(composer.steps, true);
    label.textContent = 'SEQUÊNCIA · ' + composer.steps.length + (composer.steps.length === 1 ? ' NOTA' : ' NOTAS');
    sequence.innerHTML = sequenceMarkup(composer.steps, composer.steps.length > 0);
  }


  function addComposerStep(zone) {
    if (!composer || !zone) return;
    composer.steps.push({ string: Number(zone.dataset.string), fret: Number(zone.dataset.fret) });
    renderComposerProgress();
  }

  function renderComposer() {
    const root = $('phraseComposer');
    if (!composer) {
      root.classList.add('hidden');
      root.innerHTML = '';
      document.body.classList.remove('sheet-open');
      return;
    }
    const scrollTop = root.scrollTop;
    root.classList.remove('hidden');
    document.body.classList.add('sheet-open');
    root.innerHTML = composerMarkup();
    root.scrollTop = scrollTop;
    const titleInput = $('phraseTitle');
    titleInput.addEventListener('input', () => { composer.title = titleInput.value; });
    if ($('phraseLine')) $('phraseLine').addEventListener('change', (event) => {
      composer.lineIndex = Number(event.target.value);
      renderComposer();
    });
    $('closeComposer').addEventListener('click', () => { composer = null; renderComposer(); });
    $('undoNote').addEventListener('click', () => { composer.steps.pop(); renderComposerProgress(); });
    $('clearNotes').addEventListener('click', () => { composer.steps = []; renderComposerProgress(); });
    $('savePhrase').addEventListener('click', savePhraseFromComposer);
    $('savePhraseTop').addEventListener('click', savePhraseFromComposer);

  }

  function openComposer(phrase) {
    composer = phrase
      ? { editId: phrase.id, id: phrase.id, title: phrase.title || '', lineIndex: Number(phrase.lineIndex) || 0, steps: structuredClone(phrase.steps || []) }
      : { editId: null, id: makeId(), title: editorMode === 'cues' ? '' : 'Frase ' + (draftPhrases.length + 1), lineIndex: Math.max(0, nonEmptyLines($('songLyrics').value)[0]?.index || 0), steps: [] };
    $('phraseComposer').scrollTop = 0;
    renderComposer();
  }

  function savePhraseFromComposer() {
    if (!composer) return;
    composer.title = $('phraseTitle').value.trim() || (editorMode === 'cues' ? 'Chamada ' + (draftPhrases.length + 1) : 'Frase ' + (draftPhrases.length + 1));
    if (editorMode === 'lyrics') {
      if (!nonEmptyLines($('songLyrics').value).length) {
        showToast('Cole a letra antes de escolher a linha da frase.');
        return;
      }
      composer.lineIndex = Number($('phraseLine').value);
      if (composer.lineIndex < 0) {
        showToast('Escolha a linha da letra onde a frase entra.');
        return;
      }
    }
    if (!composer.steps.length) {
      showToast('Toque nas casas do braço para montar a frase.');
      return;
    }
    const saved = { id: composer.id, title: composer.title, lineIndex: editorMode === 'lyrics' ? composer.lineIndex : 0, steps: structuredClone(composer.steps) };
    const index = draftPhrases.findIndex((phrase) => phrase.id === saved.id);
    if (index >= 0) draftPhrases[index] = saved;
    else draftPhrases.push(saved);
    composer = null;
    renderComposer();
    renderPhraseList();
    const phraseWasSaved = persistPhraseDraft();
    showToast(phraseWasSaved
      ? 'Frase salva neste aparelho. Já pode aparecer no estudo.'
      : 'Frase no rascunho. Toque em Salvar música para gravar.');
  }

  function persistPhraseDraft() {
    const title = $('songTitle').value.trim();
    const group = $('songGroup').value;
    if (!title || !group) return false;

    const urlText = $('songUrl').value.trim();
    let url = '';
    if (urlText) {
      try {
        const parsed = new URL(urlText);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
        url = parsed.href;
      } catch (error) {
        return false;
      }
    }

    const existing = songs.find((song) => song.id === editingId);
    const song = {
      id: editingId || makeId(),
      title,
      key: $('songKey').value,
      group,
      url,
      lyrics: $('songLyrics').value,
      studyMode: editorMode,
      phrases: structuredClone(draftPhrases),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const previousSongs = songs;
    songs = existing
      ? songs.map((item) => item.id === existing.id ? song : item)
      : [song, ...songs];
    if (!persist()) {
      songs = previousSongs;
      return false;
    }
    editingId = song.id;
    renderLibrary();
    return true;
  }
  function saveSong() {
    const title = $('songTitle').value.trim();
    if (!title) {
      $('songTitle').focus();
      showToast('Dê um nome para a música.');
      return;
    }
    const group = $('songGroup').value;
    if (!group) {
      $('songGroup').focus();
      showToast('Escolha o grupo desta música.');
      return;
    }
    const urlText = $('songUrl').value.trim();
    let url = '';
    if (urlText) {
      try {
        const parsed = new URL(urlText);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('protocol');
        url = parsed.href;
      } catch (error) {
        $('songUrl').focus();
        showToast('Confira o link do YouTube.');
        return;
      }
    }
    const existing = songs.find((song) => song.id === editingId);
    const song = {
      id: editingId || makeId(),
      title,
      key: $('songKey').value,
      group,
      url,
      lyrics: $('songLyrics').value,
      studyMode: editorMode,
      phrases: draftPhrases,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (existing) songs = songs.map((item) => item.id === existing.id ? song : item);
    else songs.unshift(song);
    if (!persist()) return;
    renderLibrary();
    showView('library');
    showToast(existing ? 'Música atualizada.' : 'Música salva neste aparelho.');
  }

  function phraseCardMarkup(phrase, cueMode) {
    const heading = cueMode ? 'Desenho do baixo' : (phrase.title || 'Frase do baixo');
    return '<article class="phrase-card"><div class="phrase-card-heading"><span>' + escapeHtml(heading) + '</span><span>' + boardRangeLabel(phrase.steps) + '</span></div>' + fretboardSvg(phrase.steps, false) + '<div class="sequence-chips">' + sequenceMarkup(phrase.steps, false) + '</div></article>';
  }

  function renderStageLyrics(song) {
    const lines = normalizedLyrics(song.lyrics || '');
    const container = $('stageLyrics');
    container.dataset.activeLine = '';
    container.innerHTML = lines.map((line, index) => line.trim()
      ? '<p class="stage-lyric-row" data-line-index="' + index + '">' + escapeHtml(line) + '</p>'
      : '<div class="stage-lyric-spacer" aria-hidden="true"></div>').join('');

    stageRows = Array.from(container.querySelectorAll('.stage-lyric-row'));
    stageRowByLine = new Map(stageRows.map((row) => [Number(row.dataset.lineIndex), row]));
    stagePositionByLine = new Map(stageRows.map((row, position) => [Number(row.dataset.lineIndex), position]));
    stagePhrases = (song.phrases || [])
      .map((phrase) => ({ phrase, position: stagePositionByLine.get(Number(phrase.lineIndex)) }))
      .filter((entry) => Number.isInteger(entry.position))
      .sort((a, b) => a.position - b.position);
    stageDisplayedPhrase = null;
    stagePhraseHeading = null;
    stagePhraseDistance = null;
    stageEmptyRendered = false;
    lastStageFocusAt = 0;
  }

  function currentLyricIndex(container, selector) {
    const rows = Array.from(container.querySelectorAll(selector));
    if (!rows.length) return -1;
    const marker = container.getBoundingClientRect().top + container.clientHeight * 0.43;
    let closest = rows[0];
    let distance = Infinity;
    rows.forEach((row) => {
      const rect = row.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const nextDistance = Math.abs(center - marker);
      if (nextDistance < distance) {
        closest = row;
        distance = nextDistance;
      }
    });
    return Number(closest.dataset.lineIndex);
  }

  function currentStageLyricIndex(container) {
    if (!stageRows.length) return -1;
    const bounds = container.getBoundingClientRect();
    const markerY = bounds.top + container.clientHeight * 0.43;
    const markerX = bounds.left + bounds.width / 2;
    const hit = document.elementFromPoint(markerX, markerY);
    const hitRow = hit && hit.closest ? hit.closest('.stage-lyric-row') : null;
    if (hitRow && container.contains(hitRow)) return Number(hitRow.dataset.lineIndex);

    const target = container.scrollTop + container.clientHeight * 0.43;
    let low = 0;
    let high = stageRows.length - 1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      const row = stageRows[middle];
      const center = row.offsetTop + row.offsetHeight / 2;
      if (center < target) low = middle + 1;
      else high = middle - 1;
    }
    const candidates = [stageRows[Math.max(0, Math.min(stageRows.length - 1, high))], stageRows[Math.max(0, Math.min(stageRows.length - 1, low))]];
    let closest = candidates[0];
    let distance = Infinity;
    candidates.forEach((row) => {
      const center = row.offsetTop + row.offsetHeight / 2;
      const nextDistance = Math.abs(center - target);
      if (nextDistance < distance) {
        closest = row;
        distance = nextDistance;
      }
    });
    return Number(closest.dataset.lineIndex);
  }

  function updateStagePhrasePanel() {
    const panel = $('stagePhrasePanel');
    if (!panel) return;
    const currentPosition = Math.max(0, stagePositionByLine.get(stageLineIndex) || 0);
    const next = stagePhrases.find((entry) => entry.position >= currentPosition);
    let previous = null;
    for (let index = stagePhrases.length - 1; index >= 0; index -= 1) {
      if (stagePhrases[index].position <= currentPosition) {
        previous = stagePhrases[index];
        break;
      }
    }
    const nextDistance = next ? next.position - currentPosition : Infinity;
    const selected = nextDistance <= 2 ? next : previous;

    if (!selected) {
      if (!stageEmptyRendered) {
        panel.innerHTML = '<p class="stage-empty-cue">A próxima frase do baixo aparece aqui quando você se aproximar dela.</p>';
        stageDisplayedPhrase = null;
        stagePhraseHeading = null;
        stagePhraseDistance = null;
        stageEmptyRendered = true;
      }
      return;
    }

    stageEmptyRendered = false;
    if (stageDisplayedPhrase !== selected.phrase) {
      panel.innerHTML = phraseCardMarkup(selected.phrase, false);
      stageDisplayedPhrase = selected.phrase;
      stagePhraseHeading = panel.querySelector('.phrase-card-heading span:first-child');
      stagePhraseDistance = panel.querySelector('.phrase-card-heading span:last-child');
    }

    stagePhraseHeading.textContent = selected.position > currentPosition
      ? 'PRÓXIMA FRASE · ' + (selected.phrase.title || 'ARRANJO')
      : (selected.position === currentPosition ? 'TOQUE AGORA · ' : 'FRASE DESTA PARTE · ') + (selected.phrase.title || 'ARRANJO');
    const distance = selected.position - currentPosition;
    stagePhraseDistance.textContent = distance > 0
      ? 'em ' + distance + (distance === 1 ? ' linha' : ' linhas')
      : (distance === 0 ? 'nesta linha' : 'trecho anterior');
  }

  function updateStageFocus() {
    const panel = $('stageLyrics');
    const nextIndex = currentStageLyricIndex(panel);
    if (nextIndex < 0 || nextIndex === stageLineIndex) return;
    const previousRow = stageRowByLine.get(stageLineIndex);
    if (previousRow) {
      previousRow.classList.remove('is-current');
      previousRow.removeAttribute('aria-current');
    }
    stageLineIndex = nextIndex;
    panel.dataset.activeLine = String(nextIndex);
    const currentRow = stageRowByLine.get(nextIndex);
    if (currentRow) {
      currentRow.classList.add('is-current');
      currentRow.setAttribute('aria-current', 'true');
    }
    updateStagePhrasePanel();
  }

  function scheduleStageFocus() {
    if (stageFocusFrame) return;
    stageFocusFrame = requestAnimationFrame(() => {
      stageFocusFrame = 0;
      if (isStageMode && !isPlaying) updateStageFocus();
    });
  }

  function scrollStageToLine(lineIndex) {
    const panel = $('stageLyrics');
    const row = panel.querySelector('[data-line-index="' + lineIndex + '"]');
    if (!row) return;
    panel.scrollTop = Math.max(0, row.offsetTop - panel.clientHeight * 0.43 + row.offsetHeight / 2);
    scrollPosition = panel.scrollTop;
    updateStageFocus();
  }

  function enterStageMode() {
    if (!studySongId || $('stageLaunchButton').classList.contains('hidden')) return;
    pauseStudy(false);
    const currentIndex = currentLyricIndex($('studyLyrics'), '.lyric-row');
    $('stageView').classList.remove('hidden');
    $('stageView').setAttribute('aria-hidden', 'false');
    document.body.classList.add('stage-mode');
    isStageMode = true;
    scrollStageToLine(currentIndex >= 0 ? currentIndex : 0);
    $('stageStatus').textContent = 'Pronto para tocar';
    $('stagePlayButton').focus({ preventScroll: true });
  }

  function exitStageMode() {
    if (!isStageMode) return;
    updateStageFocus();
    const returnIndex = stageLineIndex;
    pauseStudy(false);
    isStageMode = false;
    $('stageView').classList.add('hidden');
    $('stageView').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('stage-mode');
    const row = $('studyLyrics').querySelector('[data-line-index="' + returnIndex + '"]');
    if (row) $('studyLyrics').scrollTop = Math.max(0, row.offsetTop - $('studyLyrics').clientHeight * 0.43 + row.offsetHeight / 2);
    scrollPosition = $('studyLyrics').scrollTop;
    $('readingStatus').textContent = 'Pausado no trecho atual';
    $('stageLaunchButton').focus({ preventScroll: true });
  }
  function startStudy(songId) {
    const song = songs.find((item) => item.id === songId);
    if (!song) return;
    studySongId = songId;
    const cueMode = (song.studyMode || (song.lyrics ? 'lyrics' : 'cues')) === 'cues';
    $('studyTitle').textContent = song.title;
    $('stageTitle').textContent = song.title;
    $('stageKey').textContent = 'Tom · ' + (song.key || 'não definido');
    $('stageLaunchButton').classList.toggle('hidden', (song.studyMode || (song.lyrics ? 'lyrics' : 'cues')) === 'cues');
    $('studyKey').textContent = 'Tom · ' + (song.key || 'não definido');
    const groupBadge = $('studyGroup');
    groupBadge.textContent = groupLabel(song.group);
    groupBadge.classList.toggle('hidden', !song.group);
    const link = $('youtubeLink');
    if (song.url) { link.href = song.url; link.classList.remove('hidden'); }
    else { link.removeAttribute('href'); link.classList.add('hidden'); }
    const phrases = song.phrases || [];
    let markup = '';
    if (cueMode) {
      markup = phrases.map((phrase, index) => '<div class="short-cue-row"><span>' + (index + 1) + '</span><strong>' + escapeHtml(phrase.title || 'Frase do baixo') + '</strong></div>' + phraseCardMarkup(phrase, true)).join('');
    } else {
      const lines = normalizedLyrics(song.lyrics || '');
      const phrasesByLine = new Map();
      phrases.forEach((phrase) => {
        const lineIndex = Number(phrase.lineIndex);
        if (!phrasesByLine.has(lineIndex)) phrasesByLine.set(lineIndex, []);
        phrasesByLine.get(lineIndex).push(phrase);
      });
      lines.forEach((line, index) => {
        if (line.trim()) markup += '<p class="lyric-row' + (phrasesByLine.has(index) ? ' current-cue' : '') + '" data-line-index="' + index + '"><span class="lyric-text">' + escapeHtml(line) + '</span></p>';
        (phrasesByLine.get(index) || []).forEach((phrase) => { markup += phraseCardMarkup(phrase, false); });
        if (!line.trim() && !phrasesByLine.has(index)) markup += '<div class="lyric-spacer" aria-hidden="true"></div>';
      });
    }
    if (!markup.trim()) markup = '<div class="study-empty">' + (cueMode ? 'Esta música ainda não tem lembretes. Edite para adicionar as chamadas e os desenhos do baixo.' : 'Esta música ainda não tem letra. Edite para adicionar a letra e marcar as frases.') + '</div>';
    $('studyLyrics').innerHTML = markup;
    $('studyLyrics').scrollTop = 0;
    renderStageLyrics(song);
    stageLineIndex = 0;
    updateStagePhrasePanel();
    $('studyDock').classList.toggle('hidden', cueMode);
    $('studyView').classList.toggle('cue-mode', cueMode);
    studySpeed = 0.75;
    $('speedSlider').value = String(studySpeed);
    updateSpeedLabel();
    pauseStudy(false);
    $('readingStatus').textContent = cueMode ? phrases.length + (phrases.length === 1 ? ' lembrete cadastrado' : ' lembretes cadastrados') : 'Pronto para estudar';
    showView('study');
  }

  function updateSpeedLabel() {
    $('speedValue').textContent = studySpeed.toFixed(2).replace('.', ',') + '×';
    $('stageSpeedValue').textContent = studySpeed.toFixed(2).replace('.', ',') + '×';
  }

  function setSpeed(value) {
    studySpeed = Math.max(0.25, Math.min(2, Math.round(Number(value) * 4) / 4));
    $('speedSlider').value = String(studySpeed);
    updateSpeedLabel();
  }

  function scrollFrame(now) {
    if (!isPlaying) return;
    if (!lastFrame) lastFrame = now;
    const delta = Math.min(now - lastFrame, 60);
    lastFrame = now;
    const panel = $(isStageMode ? 'stageLyrics' : 'studyLyrics');
    const maxScroll = Math.max(0, panel.scrollHeight - panel.clientHeight);
    scrollPosition = Math.min(maxScroll, scrollPosition + delta * studySpeed * 0.03);
    panel.scrollTop = scrollPosition;
    if (isStageMode && now - lastStageFocusAt >= 80) {
      lastStageFocusAt = now;
      updateStageFocus();
    }
    if (scrollPosition >= maxScroll - 2) {
      pauseStudy(false);
      $('readingStatus').textContent = 'Fim da letra';
      $('stageStatus').textContent = 'Fim da letra';
      return;
    }
    animationFrame = requestAnimationFrame(scrollFrame);
  }

  function pauseStudy(updateStatus) {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrame = 0;
    isPlaying = false;
    if ($('playButton')) {
      $('playButton').innerHTML = ICON_PLAY + '<span>Começar</span>';
      $('playButton').setAttribute('aria-label', 'Começar rolagem da letra');
    }
    if ($('stagePlayButton')) {
      $('stagePlayButton').innerHTML = ICON_PLAY + '<span>Começar</span>';
      $('stagePlayButton').setAttribute('aria-label', 'Começar rolagem da letra');
    }
    if (updateStatus && $('readingStatus')) $('readingStatus').textContent = 'Pausado · role manualmente se quiser';
    if (updateStatus && $('stageStatus')) $('stageStatus').textContent = 'Pausado';
  }

  function toggleStudy() {
    if (isPlaying) {
      pauseStudy(true);
      return;
    }
    const panel = $(isStageMode ? 'stageLyrics' : 'studyLyrics');
    if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2) panel.scrollTop = 0;
    scrollPosition = panel.scrollTop;
    isPlaying = true;
    $('playButton').innerHTML = ICON_PAUSE + '<span>Pausar</span>';
    $('playButton').setAttribute('aria-label', 'Pausar rolagem da letra');
    $('stagePlayButton').innerHTML = ICON_PAUSE + '<span>Pausar</span>';
    $('stagePlayButton').setAttribute('aria-label', 'Pausar rolagem da letra');
    $('readingStatus').textContent = 'Letra rolando';
    $('stageStatus').textContent = 'Letra rolando';
    lastFrame = 0;
    animationFrame = requestAnimationFrame(scrollFrame);
  }

  function deleteSong(songId) {
    const song = songs.find((item) => item.id === songId);
    if (!song || !window.confirm('Excluir “' + song.title + '” e suas frases deste aparelho?')) return;
    songs = songs.filter((item) => item.id !== songId);
    persist();
    renderLibrary();
    if (editingId === songId) {
      editingId = null;
      draftPhrases = [];
      showView('library');
    }
    showToast('Música excluída.');
  }

  function closeMoreMenu() {
    const menu = $('moreMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    $('moreButton').setAttribute('aria-expanded', 'false');
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), songs }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'estudo-bass-repertorio.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data.songs;
      if (!Array.isArray(incoming) || !incoming.every((song) => song && typeof song.title === 'string' && Array.isArray(song.phrases))) {
        throw new Error('Formato');
      }
      const clean = incoming.map((song) => ({
        id: typeof song.id === 'string' ? song.id : makeId(),
        title: song.title.slice(0, 100),
        key: typeof song.key === 'string' ? song.key : '',
        group: GROUPS.some((group) => group.id === song.group) ? song.group : '',
        url: typeof song.url === 'string' ? song.url : '',
        lyrics: typeof song.lyrics === 'string' ? song.lyrics : '',
        studyMode: song.studyMode === 'lyrics' || song.studyMode === 'cues' ? song.studyMode : (song.lyrics ? 'lyrics' : 'cues'),
        phrases: song.phrases.filter((phrase) => phrase && Array.isArray(phrase.steps)).map((phrase) => ({
          id: typeof phrase.id === 'string' ? phrase.id : makeId(),
          title: typeof phrase.title === 'string' ? phrase.title.slice(0, 80) : 'Frase do baixo',
          cueText: typeof phrase.cueText === 'string' ? phrase.cueText.slice(0, 80) : '',
          lineIndex: Math.max(0, Number(phrase.lineIndex) || 0),
          steps: phrase.steps.filter((step) => Number.isInteger(step.string) && step.string >= 0 && step.string < 5 && Number.isInteger(step.fret) && step.fret >= 0 && step.fret <= 12)
        })),
        createdAt: song.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
      if (!window.confirm('Importar ' + clean.length + ' músicas? O repertório atual deste aparelho será substituído.')) return;
      songs = clean;
      persist();
      renderLibrary();
      showView('library');
      showToast('Repertório importado.');
    } catch (error) {
      showToast('Esse arquivo não parece ser uma cópia do Estudo Bass.');
    } finally {
      $('importFile').value = '';
    }
  }

  function bindEvents() {
    $('newSongButton').addEventListener('click', () => openEditor(null));
    $('firstSongButton').addEventListener('click', () => openEditor(null));
    $('editorBack').addEventListener('click', () => { renderLibrary(); showView('library'); });
    $('studyBack').addEventListener('click', () => { renderLibrary(); showView('library'); });
    $('saveSongButton').addEventListener('click', saveSong);
    $('saveSongTop').addEventListener('click', saveSong);
    $('deleteSongButton').addEventListener('click', () => { if (editingId) deleteSong(editingId); });
    $('moreButton').addEventListener('click', (event) => {
      event.stopPropagation();
      const open = $('moreMenu').classList.contains('hidden');
      $('moreMenu').classList.toggle('hidden', !open);
      $('moreButton').setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.more-wrap')) closeMoreMenu();
    });
    $('emptyImportButton').addEventListener('click', () => $('importFile').click());
    $('addPhraseButton').addEventListener('click', () => openComposer(null));
    $('phraseComposer').addEventListener('click', (event) => {
      const zone = event.target.closest && event.target.closest('.fret-zone');
      if (composer && zone && zone.closest('#composerBoard')) addComposerStep(zone);
    });
    $('phraseComposer').addEventListener('keydown', (event) => {
      const zone = event.target.closest && event.target.closest('.fret-zone');
      if (!composer || !zone || !zone.closest('#composerBoard')) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        addComposerStep(zone);
      }
    });
    document.querySelectorAll('input[name="studyMode"]').forEach((input) => input.addEventListener('change', () => {
      if (!input.checked) return;
      editorMode = input.value;
      applyEditorMode();
    }));
    $('songLyrics').addEventListener('input', schedulePhraseLineLabels);
    $('cleanLyricsButton').addEventListener('click', () => {
      const lyrics = $('songLyrics');
      const cleaned = cleanTranscript(lyrics.value);
      if (cleaned === lyrics.value.trim()) {
        showToast('Não encontrei horários para remover.');
        return;
      }
      lyrics.value = cleaned;
      renderPhraseList();
      showToast('Horários removidos. Agora marque as linhas das frases.');
    });
    $('phraseList').addEventListener('click', (event) => {
      const button = event.target.closest('[data-phrase-action]');
      if (!button) return;
      const phrase = draftPhrases.find((item) => item.id === button.dataset.id);
      if (!phrase) return;
      if (button.dataset.phraseAction === 'edit') openComposer(phrase);
      else {
        draftPhrases = draftPhrases.filter((item) => item.id !== phrase.id);
        renderPhraseList();
        if (!persistPhraseDraft()) showToast('Remoção no rascunho. Toque em Salvar música para gravar.');
      }
    });
    $('songsGrid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'study') startStudy(button.dataset.id);
    });
    $('groupFilters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-group]');
      if (!button) return;
      libraryGroupFilter = button.dataset.group;
      renderLibrary();
    });
    $('searchInput').addEventListener('input', scheduleLibraryRender);
    $('editCurrentButton').addEventListener('click', () => openEditor(songs.find((song) => song.id === studySongId)));
    $('stageLaunchButton').addEventListener('click', enterStageMode);
    $('stageExitButton').addEventListener('click', exitStageMode);
    $('playButton').addEventListener('click', toggleStudy);
    $('stagePlayButton').addEventListener('click', toggleStudy);
    $('stageSlowerButton').addEventListener('click', () => setSpeed(studySpeed - 0.25));
    $('stageFasterButton').addEventListener('click', () => setSpeed(studySpeed + 0.25));
    $('stageLyrics').addEventListener('pointerdown', () => { if (isPlaying) pauseStudy(true); }, { passive: true });
    $('stageLyrics').addEventListener('scroll', () => {
      if (isStageMode && !isPlaying) scheduleStageFocus();
    }, { passive: true });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (isStageMode) exitStageMode();
      else if (composer) { composer = null; renderComposer(); }
      else closeMoreMenu();
    });
    document.addEventListener('gesturestart', (event) => event.preventDefault(), { passive: false });
    document.addEventListener('gesturechange', (event) => event.preventDefault(), { passive: false });
    $('speedSlider').addEventListener('input', (event) => setSpeed(event.target.value));
    $('slowerButton').addEventListener('click', () => setSpeed(studySpeed - 0.25));
    $('fasterButton').addEventListener('click', () => setSpeed(studySpeed + 0.25));
    $('topButton').addEventListener('click', () => {
      pauseStudy(false);
      $('studyLyrics').scrollTo({ top: 0, behavior: 'smooth' });
      $('readingStatus').textContent = 'Pronto para estudar';
    });
    $('exportButton').addEventListener('click', () => { closeMoreMenu(); downloadJson(); });
    $('importButton').addEventListener('click', () => { closeMoreMenu(); $('importFile').click(); });
    $('importFile').addEventListener('change', (event) => importJson(event.target.files[0]));
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      installPrompt = event;
      $('installButton').classList.remove('hidden');
    });
    const isIPhoneOrIPad = /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
    const isInstalledApp = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isIPhoneOrIPad && !isInstalledApp) {
      $('installButton').textContent = 'Instalar no iPhone';
      $('installButton').classList.remove('hidden');
    }
    $('installButton').addEventListener('click', async () => {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        $('installButton').classList.add('hidden');
      } else if (isIPhoneOrIPad) {
        showToast('No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.');
      }
    });
    $('studyLyrics').addEventListener('pointerdown', () => { if (isPlaying) pauseStudy(true); }, { passive: true });
  }

  function initialize() {
    populateKeys('');
    document.body.dataset.view = 'library';
    $('emptyArt').innerHTML = fretboardSvg([{ string: 3, fret: 3 }, { string: 2, fret: 2 }, { string: 2, fret: 5 }], false);
    pauseStudy(false);
    bindEvents();
    renderLibrary();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let refreshedForUpdate = false;
      if (hadController) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshedForUpdate) return;
          refreshedForUpdate = true;
          window.location.reload();
        });
      }
      navigator.serviceWorker.register('./sw.js?v=16', { updateViaCache: 'none' })
        .then((registration) => registration.update())
        .catch(() => {});
    }
  }

  initialize();
})();
