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
  const GROUPS = [{ id: 'adolescentes', label: 'Adolescentes', target: 3, countId: 'groupCountTeens' }, { id: 'jovens', label: 'Jovens', target: 3, countId: 'groupCountYouth' }, { id: 'senhoras', label: 'Senhoras', target: 3, countId: 'groupCountLadies' }, { id: 'louvor', label: 'Ministério de louvor', target: 5, countId: 'groupCountWorship' }];
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

  function fretX(fret) {
    if (Number(fret) === 0) return 40;
    return 52 + (Number(fret) - 0.5) * 41.333333;
  }

  function stringY(index) {
    return 31 + index * 38;
  }

  function uniqueSteps(steps) {
    const map = new Map();
    (steps || []).forEach((step) => {
      const key = step.string + ':' + step.fret;
      if (!map.has(key)) map.set(key, { string: step.string, fret: Number(step.fret), id: map.size + 1 });
    });
    return Array.from(map.values());
  }

  function fretboardSvg(steps, interactive) {
    const safeSteps = Array.isArray(steps) ? steps : [];
    const points = uniqueSteps(safeSteps);
    const pointByKey = new Map(points.map((point) => [point.string + ':' + point.fret, point]));
    let svg = '<svg class="fretboard" viewBox="0 0 570 224" role="img" aria-label="Braço de baixo de cinco cordas">';
    svg += '<defs><marker id="arrow-head" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6z" fill="#b78b91"/></marker></defs>';
    svg += '<rect x="50" y="10" width="504" height="181" rx="7" fill="#fbfaf6"/>';
    STRINGS.forEach((string, index) => {
      const y = stringY(index);
      svg += '<text x="25" y="' + (y + 4) + '" class="string-label">' + string.name + '</text>';
      svg += '<line x1="52" y1="' + y + '" x2="554" y2="' + y + '" class="fret-string"/>';
    });
    svg += '<line x1="52" y1="12" x2="52" y2="184" class="fret-nut"/>';
    svg += '<text x="40" y="208" class="fret-label">0</text>';
    for (let fret = 1; fret <= 12; fret += 1) {
      const x = 52 + fret * 41.333333;
      svg += '<line x1="' + x + '" y1="12" x2="' + x + '" y2="184" class="fret-line"/>';
      svg += '<text x="' + (x - 20.666667) + '" y="208" class="fret-label">' + fret + '</text>';
    }
    if (interactive) {
      for (let row = 0; row < STRINGS.length; row += 1) {
        svg += '<rect class="fret-zone" x="28" y="' + (stringY(row) - 15) + '" width="24" height="30" data-string="' + row + '" data-fret="0" tabindex="0" role="button" aria-label="Corda ' + STRINGS[row].name + ', solta"/>';
        for (let fret = 1; fret <= 12; fret += 1) {
          const x = 52 + (fret - 1) * 41.333333;
          const y = stringY(row) - 15;
          svg += '<rect class="fret-zone" x="' + x + '" y="' + y + '" width="41.333333" height="30" data-string="' + row + '" data-fret="' + fret + '" tabindex="0" role="button" aria-label="Corda ' + STRINGS[row].name + ', casa ' + fret + '"/>';
        }
      }
    }
    for (let index = 0; index < safeSteps.length - 1; index += 1) {
      const from = safeSteps[index];
      const to = safeSteps[index + 1];
      const fromPoint = { x: fretX(from.fret), y: stringY(from.string) };
      const toPoint = { x: fretX(to.fret), y: stringY(to.string) };
      const dx = toPoint.x - fromPoint.x;
      const dy = toPoint.y - fromPoint.y;
      const length = Math.sqrt(dx * dx + dy * dy) || 1;
      const offset = index % 2 === 0 ? -15 : 15;
      const cx = (fromPoint.x + toPoint.x) / 2 - (dy / length) * offset;
      const cy = (fromPoint.y + toPoint.y) / 2 + (dx / length) * offset;
      const same = fromPoint.x === toPoint.x && fromPoint.y === toPoint.y;
      if (same) {
        svg += '<path class="fret-route" d="M ' + fromPoint.x + ' ' + fromPoint.y + ' C ' + (fromPoint.x + 18) + ' ' + (fromPoint.y - 19) + ', ' + (fromPoint.x + 18) + ' ' + (fromPoint.y + 19) + ', ' + fromPoint.x + ' ' + (fromPoint.y + 1) + '"/>';
      } else {
        svg += '<path class="fret-route" d="M ' + fromPoint.x + ' ' + fromPoint.y + ' Q ' + cx + ' ' + cy + ' ' + toPoint.x + ' ' + toPoint.y + '"/>';
      }
    }
    points.forEach((point) => {
      const last = safeSteps[safeSteps.length - 1];
      const active = last && last.string === point.string && Number(last.fret) === point.fret;
      const x = fretX(point.fret);
      const y = stringY(point.string);
      svg += '<circle cx="' + x + '" cy="' + y + '" r="' + (active ? 12 : 11) + '" class="fret-dot' + (active ? ' active' : '') + '"/>';
      svg += '<text x="' + x + '" y="' + y + '" class="fret-dot-label">' + point.id + '</text>';
    });
    if (interactive && safeSteps.length === 0) {
      svg += '<text x="303" y="111" text-anchor="middle" fill="#9a968b" font-size="12">Toque em uma casa para começar</text>';
    }
    svg += '</svg>';
    return svg;
  }

  function sequenceMarkup(steps) {
    if (!steps || !steps.length) return '<span class="small-hint">Ainda sem notas. Toque no braço na ordem da frase.</span>';
    const ids = new Map(uniqueSteps(steps).map((point) => [point.string + ':' + point.fret, point.id]));
    return steps.map((step, index) => {
      const label = noteAt(step.string, step.fret);
      const id = ids.get(step.string + ':' + step.fret);
      const chip = '<span class="sequence-chip"><b>' + id + '</b>' + escapeHtml(label) + '</span>';
      return chip + (index < steps.length - 1 ? '<span class="sequence-arrow">→</span>' : '');
    }).join('');
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
  function renderLibrary() {
    const query = $('searchInput').value.trim().toLocaleLowerCase('pt-BR');
    const groupMatches = songs.filter((song) => libraryGroupFilter === 'all' || song.group === libraryGroupFilter);
    const matches = groupMatches.filter((song) => song.title.toLocaleLowerCase('pt-BR').includes(query));
    $('songCount').textContent = songs.length + (songs.length === 1 ? ' música' : ' músicas');
    $('groupCountAll').textContent = String(songs.length);
    GROUPS.forEach((group) => {
      const count = songs.filter((song) => song.group === group.id).length;
      $(group.countId).textContent = count + '/' + group.target;
    });
    $('groupFilters').querySelectorAll('[data-group]').forEach((button) => {
      const active = button.dataset.group === libraryGroupFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('emptyState').classList.toggle('hidden', songs.length > 0);
    $('songsGrid').classList.toggle('hidden', matches.length === 0);
    $('songsGrid').innerHTML = matches.map((song) => {
      const phraseCount = (song.phrases || []).length;
      const cueMode = (song.studyMode || (song.lyrics ? 'lyrics' : 'cues')) === 'cues';
      const guideCount = cueMode ? phraseCount : nonEmptyLines(song.lyrics || '').length;
      const guideLabel = cueMode ? (guideCount === 1 ? 'chamada curta' : 'chamadas curtas') : (guideCount === 1 ? 'linha de letra' : 'linhas de letra');
      return '<article class="song-card"><div class="song-card-top"><h2>' + escapeHtml(song.title) + '</h2><span class="song-key">' + escapeHtml(song.key || 'Sem tom') + '</span></div><p class="song-info">' + phraseCount + (phraseCount === 1 ? ' frase' : ' frases') + ' do baixo · ' + guideCount + ' ' + guideLabel + '</p><span class="group-tag group-' + escapeHtml(song.group || 'none') + '">' + escapeHtml(groupLabel(song.group)) + '</span><div class="song-actions"><button class="small-action study" data-action="study" data-id="' + escapeHtml(song.id) + '" type="button">Estudar</button><button class="small-action" data-action="edit" data-id="' + escapeHtml(song.id) + '" type="button">Editar</button><button class="small-action" data-action="delete" data-id="' + escapeHtml(song.id) + '" type="button" aria-label="Excluir ' + escapeHtml(song.title) + '">Excluir</button></div></article>';
    }).join('');
    if (songs.length > 0 && matches.length === 0) {
      const groupName = libraryGroupFilter === 'all' ? '' : ' em ' + groupLabel(libraryGroupFilter);
      $('songsGrid').innerHTML = '<div class="empty-state"><h2>Nenhuma música encontrada' + groupName + '</h2><p>Tente outro nome ou escolha outro grupo.</p></div>';
      $('songsGrid').classList.remove('hidden');
    }
    $('exportButton').disabled = songs.length === 0;
    $('exportButton').style.opacity = songs.length === 0 ? '.5' : '1';
  }

  function openEditor(song) {
    editingId = song ? song.id : null;
    draftPhrases = song ? structuredClone(song.phrases || []) : [];
    composer = null;
    $('editorHeading').textContent = song ? 'Editar música' : 'Nova música';
    $('songTitle').value = song ? song.title : '';
    populateKeys(song ? song.key : '');
    $('songUrl').value = song ? song.url || '' : '';
    $('songGroup').value = song ? song.group || '' : '';
    $('songLyrics').value = song ? song.lyrics || '' : '';
    editorMode = song ? (song.studyMode || (song.lyrics ? 'lyrics' : 'cues')) : 'cues';
    document.querySelectorAll('input[name="studyMode"]').forEach((input) => { input.checked = input.value === editorMode; });
    applyEditorMode();
    $('phraseComposer').classList.add('hidden');
    renderPhraseList();
    showView('editor');
  }

  function applyEditorMode() {
    const lyricsMode = editorMode === 'lyrics';
    $('lyricsFields').classList.toggle('hidden', !lyricsMode);
    $('cueModeHint').classList.toggle('hidden', lyricsMode);
    $('phraseModeHint').textContent = lyricsMode
      ? 'Cada desenho fica ligado à linha da letra onde a frase entra.'
      : 'Escreva uma chamada curta e monte o desenho. Cadastre na ordem da música.';
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
    list.innerHTML = draftPhrases.map((phrase) => {
      const line = (lines[phrase.lineIndex] || '').trim();
      const cue = editorMode === 'lyrics'
        ? 'Depois da linha ' + (Number(phrase.lineIndex) + 1) + (line ? ': “' + escapeHtml(line.slice(0, 56)) + (line.length > 56 ? '…' : '') + '”' : '')
        : 'Chamada: ' + escapeHtml(phrase.title || 'Frase do baixo');
      return '<article class="saved-phrase"><div class="saved-phrase-head"><div><div class="saved-phrase-title">' + escapeHtml(phrase.title || 'Frase do baixo') + '</div><div class="saved-phrase-cue">' + cue + '</div></div><div class="phrase-tools"><button type="button" data-phrase-action="edit" data-id="' + escapeHtml(phrase.id) + '">Editar</button><button type="button" data-phrase-action="delete" data-id="' + escapeHtml(phrase.id) + '">Remover</button></div></div><div class="saved-phrase-sequence">' + escapeHtml(compactSequence(phrase.steps)) + '</div></article>';
    }).join('');
  }

  function composerMarkup() {
    if (!composer) return '';
    const lines = nonEmptyLines($('songLyrics').value);
    const linePicker = lines.length
      ? lines.map((line) => '<option value="' + line.index + '"' + (line.index === composer.lineIndex ? ' selected' : '') + '>Linha ' + (line.index + 1) + ' · ' + escapeHtml(line.text.slice(0, 62)) + (line.text.length > 62 ? '…' : '') + '</option>').join('')
      : '<option value="-1">Adicione a letra para escolher uma linha</option>';
    const anchorField = editorMode === 'lyrics'
      ? '<label class="field"><span>Mostrar depois da linha</span><select id="phraseLine">' + linePicker + '</select></label>'
      : '';
    const titleLabel = editorMode === 'lyrics' ? 'Nome desta frase' : 'Chamada curta';
    const titlePlaceholder = editorMode === 'lyrics' ? 'Ex.: Entrada do refrão' : 'Ex.: depois da 2ª linha do refrão';
    return '<div class="composer-title"><h3>' + (composer.editId ? 'Editar frase' : 'Nova frase') + '</h3><button class="close-composer" id="closeComposer" type="button" aria-label="Fechar">×</button></div><div class="composer-fields' + (editorMode === 'cues' ? ' cue-fields' : '') + '"><label class="field"><span>' + titleLabel + '</span><input id="phraseTitle" maxlength="80" value="' + escapeHtml(composer.title) + '" placeholder="' + titlePlaceholder + '"></label>' + anchorField + '</div><div class="fretboard-wrap" id="composerBoard">' + fretboardSvg(composer.steps, true) + '</div><p class="fret-hint">Afinação Si–Mi–Lá–Ré–Sol · casas 0 a 12, corda solta à esquerda da pestana · toque uma casa por nota. Repetir a casa registra o retorno.</p><div class="sequence-box"><div class="sequence-label">ORDEM DAS NOTAS</div><div class="sequence-chips">' + sequenceMarkup(composer.steps) + '</div></div><div class="composer-actions"><button class="quiet-button" id="undoNote" type="button">Desfazer nota</button><button class="quiet-button" id="clearNotes" type="button">Limpar desenho</button><button class="primary-button" id="savePhrase" type="button">' + (composer.editId ? 'Salvar alterações' : 'Adicionar frase') + '</button></div>';
  }

  function renderComposer() {
    const root = $('phraseComposer');
    if (!composer) {
      root.classList.add('hidden');
      root.innerHTML = '';
      return;
    }
    root.classList.remove('hidden');
    root.innerHTML = composerMarkup();
    const titleInput = $('phraseTitle');
    titleInput.addEventListener('input', () => { composer.title = titleInput.value; });
    if ($('phraseLine')) $('phraseLine').addEventListener('change', (event) => {
      composer.lineIndex = Number(event.target.value);
      renderComposer();
    });
    $('closeComposer').addEventListener('click', () => { composer = null; renderComposer(); });
    $('undoNote').addEventListener('click', () => { composer.steps.pop(); renderComposer(); });
    $('clearNotes').addEventListener('click', () => { composer.steps = []; renderComposer(); });
    $('savePhrase').addEventListener('click', savePhraseFromComposer);
    $('composerBoard').querySelectorAll('.fret-zone').forEach((zone) => {
      const add = () => {
        composer.steps.push({ string: Number(zone.dataset.string), fret: Number(zone.dataset.fret) });
        renderComposer();
      };
      zone.addEventListener('click', add);
      zone.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); add(); }
      });
    });
  }

  function openComposer(phrase) {
    composer = phrase
      ? { editId: phrase.id, id: phrase.id, title: phrase.title || '', lineIndex: Number(phrase.lineIndex) || 0, steps: structuredClone(phrase.steps || []) }
      : { editId: null, id: makeId(), title: editorMode === 'cues' ? '' : 'Frase ' + (draftPhrases.length + 1), lineIndex: Math.max(0, nonEmptyLines($('songLyrics').value)[0]?.index || 0), steps: [] };
    renderComposer();
    $('phraseComposer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    const heading = cueMode ? 'DESENHO DO BAIXO' : 'FRASE DO BAIXO · ' + (phrase.title || 'ARRANJO');
    return '<article class="phrase-card"><div class="phrase-card-heading"><span>' + escapeHtml(heading) + '</span><span>observe o caminho</span></div><div class="phrase-svg-wrap">' + fretboardSvg(phrase.steps, false) + '<p class="phrase-sequence-caption">' + escapeHtml(compactSequence(phrase.steps)) + '</p></div></article>';
  }

  function renderStageLyrics(song) {
    const lines = normalizedLyrics(song.lyrics || '');
    $('stageLyrics').dataset.activeLine = '';
    $('stageLyrics').innerHTML = lines.map((line, index) => line.trim()
      ? '<p class="stage-lyric-row" data-line-index="' + index + '">' + escapeHtml(line) + '</p>'
      : '<div class="stage-lyric-spacer" aria-hidden="true"></div>').join('');
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

  function updateStagePhrasePanel() {
    const song = songs.find((item) => item.id === studySongId);
    const panel = $('stagePhrasePanel');
    if (!song || !panel) return;
    const rows = Array.from($('stageLyrics').querySelectorAll('.stage-lyric-row'));
    const positionByLine = new Map(rows.map((row, index) => [Number(row.dataset.lineIndex), index]));
    const currentPosition = Math.max(0, positionByLine.get(stageLineIndex) || 0);
    const phrases = (song.phrases || []).filter((phrase) => positionByLine.has(Number(phrase.lineIndex)))
      .sort((a, b) => Number(a.lineIndex) - Number(b.lineIndex));
    const next = phrases.find((phrase) => positionByLine.get(Number(phrase.lineIndex)) >= currentPosition);
    const previous = [...phrases].reverse().find((phrase) => positionByLine.get(Number(phrase.lineIndex)) <= currentPosition);
    const nextDistance = next ? positionByLine.get(Number(next.lineIndex)) - currentPosition : Infinity;
    const selected = nextDistance <= 2 ? next : previous;
    if (!selected) {
      panel.innerHTML = '<p class="stage-empty-cue">A próxima frase do baixo aparece aqui quando você se aproximar dela.</p>';
      return;
    }
    panel.innerHTML = phraseCardMarkup(selected, false);
    const heading = panel.querySelector('.phrase-card-heading span:first-child');
    const selectedPosition = positionByLine.get(Number(selected.lineIndex));
    heading.textContent = selectedPosition > currentPosition
      ? 'PRÓXIMA FRASE · ' + (selected.title || 'ARRANJO')
      : (selectedPosition === currentPosition ? 'TOQUE AGORA · ' : 'FRASE DESTA PARTE · ') + (selected.title || 'ARRANJO');
    const distance = selectedPosition - currentPosition;
    panel.querySelector('.phrase-card-heading span:last-child').textContent = distance > 0
      ? 'em ' + distance + (distance === 1 ? ' linha' : ' linhas')
      : (distance === 0 ? 'nesta linha' : 'trecho anterior');
  }

  function updateStageFocus() {
    const panel = $('stageLyrics');
    const nextIndex = currentLyricIndex(panel, '.stage-lyric-row');
    if (nextIndex < 0 || String(nextIndex) === panel.dataset.activeLine) return;
    stageLineIndex = nextIndex;
    panel.dataset.activeLine = String(nextIndex);
    panel.querySelectorAll('.stage-lyric-row').forEach((row) => {
      const current = Number(row.dataset.lineIndex) === nextIndex;
      row.classList.toggle('is-current', current);
      if (current) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
    updateStagePhrasePanel();
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
    $('stageKey').textContent = 'TOM · ' + (song.key || 'não definido');
    $('stageLaunchButton').classList.toggle('hidden', (song.studyMode || (song.lyrics ? 'lyrics' : 'cues')) === 'cues');
    $('studyKey').textContent = 'TOM · ' + (song.key || 'não definido');
    const groupBadge = $('studyGroup');
    groupBadge.textContent = groupLabel(song.group);
    groupBadge.classList.toggle('hidden', !song.group);
    const link = $('youtubeLink');
    if (song.url) { link.href = song.url; link.classList.remove('hidden'); }
    else { link.removeAttribute('href'); link.classList.add('hidden'); }
    const phrases = song.phrases || [];
    let markup = '';
    if (cueMode) {
      markup = phrases.map((phrase, index) => '<div class="short-cue-row"><span>LEMBRETE ' + (index + 1) + '</span><strong>' + escapeHtml(phrase.title || 'Frase do baixo') + '</strong></div>' + phraseCardMarkup(phrase, true)).join('');
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
    $('speedControl').classList.toggle('hidden', cueMode);
    $('playButton').classList.toggle('hidden', cueMode);
    $('topButton').classList.toggle('hidden', cueMode);
    $('studyStageEyebrow').textContent = cueMode ? 'CHAMADAS DAS FRASES' : 'ACOMPANHE A LETRA';
    $('studyStageHint').textContent = cueMode ? 'Cada lembrete vem junto do desenho para você visualizar o caminho.' : 'O desenho aparece junto da linha marcada.';
    $('studyStageMode').textContent = cueMode ? 'na ordem da música' : 'rolagem livre';
    $('studyFooter').textContent = cueMode ? 'As chamadas aparecem na ordem em que você cadastrou as frases.' : 'Toque em qualquer parte da letra para pausar ou rolar manualmente.';
    studySpeed = 0.75;
    $('speedSlider').value = String(studySpeed);
    $('stageSpeedSlider').value = String(studySpeed);
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
    $('stageSpeedSlider').value = String(studySpeed);
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
    if (isStageMode) updateStageFocus();
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
      $('playButton').innerHTML = '<span>▶</span><span>Começar</span>';
      $('playButton').setAttribute('aria-label', 'Começar rolagem da letra');
    }
    if ($('stagePlayButton')) {
      $('stagePlayButton').innerHTML = '<span aria-hidden="true">▶</span><span>Começar</span>';
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
    $('playButton').innerHTML = '<span>Ⅱ</span><span>Pausar</span>';
    $('playButton').setAttribute('aria-label', 'Pausar rolagem da letra');
    $('stagePlayButton').innerHTML = '<span aria-hidden="true">Ⅱ</span><span>Pausar</span>';
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
    showToast('Música excluída.');
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
    $('addPhraseButton').addEventListener('click', () => openComposer(null));
    document.querySelectorAll('input[name="studyMode"]').forEach((input) => input.addEventListener('change', () => {
      if (!input.checked) return;
      editorMode = input.value;
      applyEditorMode();
    }));
    $('songLyrics').addEventListener('input', renderPhraseList);
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
      if (button.dataset.action === 'edit') openEditor(songs.find((song) => song.id === button.dataset.id));
      if (button.dataset.action === 'delete') deleteSong(button.dataset.id);
    });
    $('groupFilters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-group]');
      if (!button) return;
      libraryGroupFilter = button.dataset.group;
      renderLibrary();
    });
    $('searchInput').addEventListener('input', renderLibrary);
    $('editCurrentButton').addEventListener('click', () => openEditor(songs.find((song) => song.id === studySongId)));
    $('stageLaunchButton').addEventListener('click', enterStageMode);
    $('stageExitButton').addEventListener('click', exitStageMode);
    $('playButton').addEventListener('click', toggleStudy);
    $('stagePlayButton').addEventListener('click', toggleStudy);
    $('stageSpeedSlider').addEventListener('input', (event) => setSpeed(event.target.value));
    $('stageSlowerButton').addEventListener('click', () => setSpeed(studySpeed - 0.25));
    $('stageFasterButton').addEventListener('click', () => setSpeed(studySpeed + 0.25));
    $('stageLyrics').addEventListener('pointerdown', () => { if (isPlaying) pauseStudy(true); }, { passive: true });
    $('stageLyrics').addEventListener('scroll', () => { if (isStageMode) updateStageFocus(); }, { passive: true });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && isStageMode) exitStageMode(); });
    $('speedSlider').addEventListener('input', (event) => setSpeed(event.target.value));
    $('slowerButton').addEventListener('click', () => setSpeed(studySpeed - 0.25));
    $('fasterButton').addEventListener('click', () => setSpeed(studySpeed + 0.25));
    $('topButton').addEventListener('click', () => {
      pauseStudy(false);
      $('studyLyrics').scrollTo({ top: 0, behavior: 'smooth' });
      $('readingStatus').textContent = 'Pronto para estudar';
    });
    $('exportButton').addEventListener('click', downloadJson);
    $('importButton').addEventListener('click', () => $('importFile').click());
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
    bindEvents();
    renderLibrary();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  initialize();
})();
