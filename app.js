const students = window.STUDENTS || [];
const turmaSelect = document.getElementById('turmaSelect');
const searchInput = document.getElementById('searchInput');
const studentList = document.getElementById('studentList');
const countInfo = document.getElementById('countInfo');
const studentPhoto = document.getElementById('studentPhoto');
const photoFrame = document.getElementById('photoFrame');
const photoStatus = document.getElementById('photoStatus');
const noPhoto = document.getElementById('noPhoto');
const serieBadge = document.getElementById('serieBadge');
const studentName = document.getElementById('studentName');
const studentClass = document.getElementById('studentClass');
const matchInfo = document.getElementById('matchInfo');
const presentation = document.getElementById('presentation');
const ROOT_PHOTOS_DIR = 'alunos';
const IMAGE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp'];
let filtered = [...students];
let currentIndex = 0;
let photoRecords = [];
let photosByPath = new Map();
let loadedFolders = new Set();
let photoAssignments = new Map();

function normalize(text) {
  return String(text || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/).filter(w => w && !['DE','DA','DO','DAS','DOS','E'].includes(w)).join(' ');
}
function hasReviewTag(text) {
  return normalize(text).split(' ').includes('REVISAR');
}
function fileBase(name) {
  return String(name || '').replace(/\.[^.]+$/, '');
}
function normalizePath(path) {
  const parts = String(path || '').split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return '';
  parts[parts.length - 1] = fileBase(parts[parts.length - 1]);
  return parts.map(normalize).filter(Boolean).join('/');
}
function encodeRelativePath(path) {
  return String(path || '').split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join('/');
}
function registerPhoto(name, relativePath, url) {
  if (hasReviewTag(name) || hasReviewTag(relativePath)) return;
  const pathKey = normalizePath(relativePath);
  const existing = photosByPath.get(pathKey);
  if (existing) {
    if (existing.objectUrl) URL.revokeObjectURL(existing.url);
    photoRecords = photoRecords.filter(record => record !== existing);
  }
  const record = {
    name,
    relativePath,
    nameKey: normalize(fileBase(name)),
    pathKey,
    url,
    objectUrl: url.startsWith('blob:')
  };
  photoRecords.push(record);
  photosByPath.set(pathKey, record);
  loadedFolders.add(photoFolderName(relativePath));
}
function updatePhotoStatus() {
  if (!photoStatus) return;
  if (!photoRecords.length) {
    photoStatus.textContent = `Buscando fotos em ${ROOT_PHOTOS_DIR}/ ou selecione uma pasta`;
    return;
  }
  photoStatus.textContent = `${photoRecords.length} foto(s) encontrada(s) em ${loadedFolders.size} pasta(s)`;
}
function photoFolderName(path) {
  const parts = String(path || '').split(/[\\/]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 2] : 'fotos';
}
function pathHasTurma(pathKey, turma) {
  return pathKey.split('/').includes(normalize(turma));
}
function normalizedWords(text) {
  return normalize(text).split(' ').filter(Boolean);
}
function wordsNearlyEqual(a, b) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      edits++;
      if (edits > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function similarity(a, b) {
  const aw = normalizedWords(a);
  const bw = normalizedWords(b);
  if (!aw.length || !bw.length) return 0;
  const used = new Set();
  let inter = 0;
  for (const word of bw) {
    const index = aw.findIndex((candidate, i) => !used.has(i) && wordsNearlyEqual(candidate, word));
    if (index >= 0) {
      used.add(index);
      inter++;
    }
  }
  const coverage = inter / Math.max(aw.length, bw.length);
  const containment = inter / Math.min(aw.length, bw.length);
  return containment === 1 && Math.min(aw.length, bw.length) >= 2 ? containment : coverage;
}
function populateTurmas() {
  const turmas = [...new Set(students.map(s => s.turma))];
  turmaSelect.innerHTML = '<option value="">Todas as turmas</option>' + turmas.map(t => `<option value="${t}">${t}</option>`).join('');
}
function applyFilters() {
  const turma = turmaSelect.value;
  const q = normalize(searchInput.value);
  filtered = students.filter(s => (!turma || s.turma === turma) && (!q || normalize(s.nome).includes(q)));
  currentIndex = Math.min(currentIndex, Math.max(filtered.length - 1, 0));
  renderList();
  showStudent(currentIndex);
}
function renderList() {
  countInfo.textContent = `${filtered.length} aluno(s)`;
  studentList.innerHTML = filtered.map((s, i) => `
    <button class="studentItem ${i === currentIndex ? 'active' : ''}" data-index="${i}">
      ${s.nome}<small>${s.serie} • Turma ${s.turma}</small>
    </button>
  `).join('');
  document.querySelectorAll('.studentItem').forEach(btn => btn.onclick = () => showStudent(Number(btn.dataset.index)));
}
function studentPhotoCandidates(student) {
  const expected = hasReviewTag(student.fotoArquivo) ? student.nome : (student.fotoArquivo || student.nome);
  const expectedPathSource = hasReviewTag(student.fotoCaminhoRar) ? `${student.turma}/${student.nome}` : (student.fotoCaminhoRar || `${student.turma}/${expected}`);
  const expectedPath = normalizePath(expectedPathSource);
  const expectedName = normalize(fileBase(expected));
  const matchingNameCount = photoRecords.filter(record => record.nameKey === expectedName).length;
  const candidates = [];

  for (const [path, record] of photosByPath.entries()) {
    if (path === expectedPath || path.endsWith(`/${expectedPath}`)) {
      candidates.push({ record, score: 3 });
    }
  }

  for (const record of photoRecords) {
    if (record.nameKey === expectedName && pathHasTurma(record.pathKey, student.turma)) {
      candidates.push({ record, score: 2.5 });
    } else if (record.nameKey === expectedName && matchingNameCount === 1) {
      candidates.push({ record, score: 2 });
    } else if (pathHasTurma(record.pathKey, student.turma)) {
      const score = Math.max(similarity(student.nome, record.nameKey), similarity(expectedName, record.nameKey));
      if (score >= 0.78) candidates.push({ record, score });
    }
  }

  return candidates.sort((a, b) => b.score - a.score).map(candidate => candidate.record);
}
function assignPhotos() {
  const usedPhotos = new Set();
  photoAssignments = new Map();
  for (const student of students) {
    const record = studentPhotoCandidates(student).find(candidate => !usedPhotos.has(candidate.url));
    if (!record) continue;
    photoAssignments.set(student.id, record);
    usedPhotos.add(record.url);
  }
}
function findPhoto(student) {
  return photoAssignments.get(student.id) || null;
}
function rootPhotoCandidates(student) {
  const candidates = new Set();
  const expected = hasReviewTag(student.fotoArquivo) ? '' : (student.fotoArquivo || '');

  if (expected) {
    candidates.add(`${ROOT_PHOTOS_DIR}/${student.turma}/${expected}`);

    if (student.fotoCaminhoRar && !hasReviewTag(student.fotoCaminhoRar)) {
      const parts = String(student.fotoCaminhoRar).split(/[\\/]+/).filter(Boolean);
      candidates.add(`${ROOT_PHOTOS_DIR}/${parts.join('/')}`);
    }
  } else {
    for (const extension of IMAGE_EXTENSIONS) {
      candidates.add(`${ROOT_PHOTOS_DIR}/${student.turma}/${student.nome}.${extension}`);
    }
  }

  return [...candidates].map(path => ({
    name: path.split('/').pop(),
    relativePath: path,
    url: encodeRelativePath(path)
  }));
}
function imageExists(url) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}
async function loadRootPhotos() {
  updatePhotoStatus();
  const seen = new Set();
  for (const student of students) {
    for (const candidate of rootPhotoCandidates(student)) {
      if (seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      if (await imageExists(candidate.url)) {
        registerPhoto(candidate.name, candidate.relativePath, candidate.url);
      }
    }
  }
  assignPhotos();
  updatePhotoStatus();
  showStudent(currentIndex);
}
function showStudent(index) {
  if (!filtered.length) {
    studentName.textContent = 'Nenhum aluno encontrado';
    studentClass.textContent = '';
    serieBadge.textContent = '';
    photoFrame.style.display = 'none';
    studentPhoto.style.display = 'none';
    noPhoto.style.display = 'none';
    matchInfo.textContent = '';
    return;
  }
  currentIndex = (index + filtered.length) % filtered.length;
  const s = filtered[currentIndex];
  serieBadge.textContent = s.serie;
  studentName.textContent = s.nome;
  studentClass.textContent = `Turma ${s.turma}`;
  const photoRecord = findPhoto(s);
  if (photoRecord) {
    photoFrame.style.display = 'flex';
    studentPhoto.src = photoRecord.url;
    studentPhoto.style.display = 'block';
    noPhoto.style.display = 'none';
    matchInfo.textContent = `Foto associada: ${photoRecord.relativePath} • confiança ${Math.round((s.fotoScore || 0) * 100)}%`;
  } else {
    photoFrame.style.display = 'none';
    studentPhoto.removeAttribute('src');
    studentPhoto.style.display = 'none';
    noPhoto.style.display = 'none';
    matchInfo.textContent = '';
  }
  renderList();
}
document.getElementById('photoInput').addEventListener('change', (event) => {
  for (const file of event.target.files) {
    if (!file.type.startsWith('image/')) continue;
    const relativePath = file.webkitRelativePath || file.name;
    registerPhoto(file.name, relativePath, URL.createObjectURL(file));
  }
  event.target.value = '';
  assignPhotos();
  updatePhotoStatus();
  showStudent(currentIndex);
});
document.getElementById('btnNext').onclick = () => showStudent(currentIndex + 1);
document.getElementById('btnPrev').onclick = () => showStudent(currentIndex - 1);
document.getElementById('btnRandom').onclick = () => showStudent(Math.floor(Math.random() * filtered.length));
document.getElementById('btnFullscreen').onclick = () => presentation.requestFullscreen?.();
turmaSelect.onchange = applyFilters;
searchInput.oninput = applyFilters;
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') showStudent(currentIndex + 1);
  if (e.key === 'ArrowLeft') showStudent(currentIndex - 1);
  if (e.key.toLowerCase() === 'f') presentation.requestFullscreen?.();
});
populateTurmas();
updatePhotoStatus();
assignPhotos();
applyFilters();
loadRootPhotos();
