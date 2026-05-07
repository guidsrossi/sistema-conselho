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
  const pathKey = normalizePath(relativePath);
  const existing = photosByPath.get(pathKey);
  if (existing) {
    if (existing.objectUrl) URL.revokeObjectURL(existing.url);
    photoRecords = photoRecords.filter(record => record !== existing);
  }
  const record = {
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
function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  const aw = new Set(a.split(' '));
  const bw = new Set(b.split(' '));
  let inter = 0; bw.forEach(w => { if (aw.has(w)) inter++; });
  const overlap = bw.size ? inter / bw.size : 0;
  let longer = a.length > b.length ? a : b;
  let shorter = a.length > b.length ? b : a;
  let same = 0;
  for (const ch of shorter) if (longer.includes(ch)) same++;
  return Math.max(overlap, same / Math.max(longer.length, 1));
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
  const expected = student.fotoArquivo || student.nome;
  const expectedPath = normalizePath(student.fotoCaminhoRar || `${student.turma}/${expected}`);
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
    photoAssignments.set(student.id, record.url);
    usedPhotos.add(record.url);
  }
}
function findPhoto(student) {
  return photoAssignments.get(student.id) || null;
}
function rootPhotoCandidates(student) {
  const candidates = new Set();
  const expected = student.fotoArquivo || '';

  if (expected) {
    candidates.add(`${ROOT_PHOTOS_DIR}/${student.turma}/${expected}`);

    if (student.fotoCaminhoRar) {
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
  const photo = findPhoto(s);
  if (photo) {
    photoFrame.style.display = 'flex';
    studentPhoto.src = photo;
    studentPhoto.style.display = 'block';
    noPhoto.style.display = 'none';
    matchInfo.textContent = s.fotoArquivo ? `Possível foto no RAR: ${s.fotoArquivo} • confiança ${Math.round((s.fotoScore || 0) * 100)}%` : '';
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
