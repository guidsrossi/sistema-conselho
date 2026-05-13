const API_URL = 'https://script.google.com/macros/s/AKfycbzMXiEA49U0A7nS4SUDtKnLYZwef5tkUfk0VFJb4EI_gc34agdABH9cYnN5XTaySTsv/exec';

const turmaSelect = document.getElementById('turmaSelect');
const searchInput = document.getElementById('searchInput');
const studentList = document.getElementById('studentList');
const countInfo = document.getElementById('countInfo');
const studentPhoto = document.getElementById('studentPhoto');
const photoFrame = document.getElementById('photoFrame');
const noPhoto = document.getElementById('noPhoto');
const serieBadge = document.getElementById('serieBadge');
const studentName = document.getElementById('studentName');
const studentClass = document.getElementById('studentClass');
const studentTutor = document.getElementById('studentTutor');
const studentFrequency = document.getElementById('studentFrequency');
const matchInfo = document.getElementById('matchInfo');
const gradesPanel = document.getElementById('gradesPanel');
const presentation = document.getElementById('presentation');
const studentInfo = document.querySelector('.studentInfo');
const studentHeader = document.querySelector('.studentHeader');
const apiStatus = document.getElementById('apiStatus');
const btnReloadApi = document.getElementById('btnReloadApi');
const loadingOverlay = document.getElementById('loadingOverlay');

let students = [];
let filtered = [];
let currentIndex = 0;
let gradesByStudent = new Map();
let frequencyByStudent = new Map();

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(word => word && !['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'].includes(word))
    .join(' ');
}

function studentKey(name, turma) {
  return `${normalize(turma)}|${normalize(name)}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function parseGrade(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value === '-') return null;

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatGrade(value) {
  if (value === null || value === undefined) return 'Sem nota';
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

function parseFrequency(value) {
  if (value === null || value === undefined || value === '') return null;

  const raw = String(value).trim();
  if (!raw || raw === '-') return null;

  const parsed = Number(raw.replace('%', '').replace(',', '.'));

  if (!Number.isFinite(parsed)) {
    return {
      text: raw,
      value: null
    };
  }

  const percent = raw.includes('%') || parsed > 1 ? parsed : parsed * 100;

  const formatted = Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(1).replace('.', ',');

  return {
    text: `${formatted}%`,
    value: percent
  };
}

function studentHasGradeBelowSeven(student) {
  const grades = student.notas || [];

  return grades.some(item => {
    const grade = parseGrade(item.nota);
    return grade !== null && grade < 7;
  });
}

function studentHasOnlyGradesAboveOrEqualSeven(student) {
  const grades = (student.notas || [])
    .map(item => parseGrade(item.nota))
    .filter(grade => grade !== null);

  return grades.length > 0 && grades.every(grade => grade >= 7);
}

function showLoading(status) {
  if (!loadingOverlay) return;
  loadingOverlay.style.display = status ? 'flex' : 'none';
}

function setApiStatus(message) {
  if (apiStatus) apiStatus.textContent = message;
}

function normalizeStudentFromApi(student, index) {
  const turma = student.turma || student.sala || student.serie || '';
  const nome = student.nome || student.nomeAluno || student.aluno || '';

  return {
    id: student.id || `${turma}-${index + 1}`,
    nome,
    turma,
    serie: student.serie || turma,
    tutor: student.tutor || student.professor || '',
    frequencia: student.frequencia || student.frequency || '',
    notas: Array.isArray(student.notas) ? student.notas : [],
    foto: student.foto || null
  };
}

async function loadDataFromApi() {
  showLoading(true);
  setApiStatus('Carregando dados do Google Planilhas e Drive...');

  try {
    const response = await fetch(`${API_URL}?action=students&cache=${Date.now()}`);

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Erro ao carregar dados da API.');
    }

students = (data.students || [])
  .map(normalizeStudentFromApi)
  .filter(student => student.nome && student.turma);

    filtered = [...students];
    currentIndex = 0;
    gradesByStudent = new Map();
    frequencyByStudent = new Map();

    students.forEach(student => {
      const key = studentKey(student.nome, student.turma);

      const grades = (student.notas || [])
        .map(item => {
          const rawGrade = item.nota;
          const nota = parseGrade(rawGrade);
          const missing = rawGrade === null || rawGrade === undefined || rawGrade === '';

          return {
            disciplina: item.disciplina || item.materia || item.nome || '',
            nota,
            missing
          };
        })
        .filter(item => item.disciplina)
        .filter(item => item.nota !== null && item.nota < 7);

      if (grades.length) {
        gradesByStudent.set(key, grades);
      }

      const frequency = parseFrequency(student.frequencia);
      if (frequency) {
        frequencyByStudent.set(key, frequency);
      }
    });

    populateTurmas();
    applyFilters();

    setApiStatus(`${students.length} estudante(s) carregado(s) para apresentaÃ§Ã£o`);
  } catch (error) {
    console.error(error);

    students = [];
    filtered = [];

    populateTurmas();
    renderList();
    showStudent(0);

    setApiStatus(`Erro: ${error.message}`);
  } finally {
    showLoading(false);
  }
}

function populateTurmas() {
  const turmas = [...new Set(students.map(student => student.turma).filter(Boolean))]
    .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { numeric: true }));

  turmaSelect.innerHTML = '<option value="">Todas as turmas</option>' + turmas
    .map(turma => `<option value="${escapeHtml(turma)}">${escapeHtml(turma)}</option>`)
    .join('');
}

function applyFilters() {
  const turma = turmaSelect.value;
  const q = normalize(searchInput.value);

  filtered = students.filter(student => {
    const turmaOk = !turma || student.turma === turma;
    const searchOk = !q || normalize(student.nome).includes(q);
    return turmaOk && searchOk;
  });

  currentIndex = Math.min(currentIndex, Math.max(filtered.length - 1, 0));

  renderList();
  showStudent(currentIndex);
}

function renderList() {
  countInfo.textContent = `${filtered.length} aluno(s)`;

  studentList.innerHTML = filtered.map((student, index) => `
    <button class="studentItem ${index === currentIndex ? 'active' : ''}" data-index="${index}">
      ${escapeHtml(student.nome)}
      <small>${escapeHtml(student.serie)} • Turma ${escapeHtml(student.turma)}</small>
      ${student.tutor ? `<small>Tutor(a): ${escapeHtml(student.tutor)}</small>` : ''}
    </button>
  `).join('');

  document.querySelectorAll('.studentItem').forEach(button => {
    button.onclick = () => showStudent(Number(button.dataset.index));
  });
}

function renderFrequency(student) {
  if (!studentFrequency) return;

  const frequency = frequencyByStudent.get(studentKey(student.nome, student.turma));

  studentFrequency.classList.remove('danger', 'warning', 'success');

  if (!frequency) {
    studentFrequency.textContent = '';
    studentFrequency.style.display = 'none';
    return;
  }

  studentFrequency.textContent = `Frequência: ${frequency.text}`;
  studentFrequency.style.display = 'inline-flex';

  if (frequency.value !== null && frequency.value !== undefined) {
    if (frequency.value < 80) {
      studentFrequency.classList.add('danger');
    } else if (frequency.value <= 89) {
      studentFrequency.classList.add('warning');
    } else {
      studentFrequency.classList.add('success');
    }
  }
}

function renderGrades(student) {
  if (!gradesPanel) return;

  const grades = gradesByStudent.get(studentKey(student.nome, student.turma)) || [];

  gradesPanel.classList.remove('compact', 'veryCompact');
  studentInfo?.classList.remove('hasGrades', 'hasManyGrades', 'hasVeryManyGrades');
  studentHeader?.classList.remove('hasGrades', 'hasManyGrades', 'hasVeryManyGrades');

  if (!grades.length) {
    if (studentHasOnlyGradesAboveOrEqualSeven(student)) {
      gradesPanel.innerHTML = `
        <div class="gradeBadge success congratulation">
          <strong>Parabéns, todas as suas notas estão acima do esperado</strong>
        </div>
      `;
    } else {
      gradesPanel.innerHTML = '';
    }
    return;
  }

  const longestDisciplineName = Math.max(...grades.map(({ disciplina }) => String(disciplina || '').length));
  const shouldCompact = grades.length >= 8 || longestDisciplineName >= 24;
  const shouldVeryCompact = grades.length >= 13 || longestDisciplineName >= 36;

  gradesPanel.classList.toggle('compact', shouldCompact);
  gradesPanel.classList.toggle('veryCompact', shouldVeryCompact);

  studentInfo?.classList.add('hasGrades');
  studentInfo?.classList.toggle('hasManyGrades', shouldCompact);
  studentInfo?.classList.toggle('hasVeryManyGrades', shouldVeryCompact);
  studentHeader?.classList.add('hasGrades');
  studentHeader?.classList.toggle('hasManyGrades', shouldCompact);
  studentHeader?.classList.toggle('hasVeryManyGrades', shouldVeryCompact);

  gradesPanel.innerHTML = grades.map(({ disciplina, nota, missing }) => `
    <div class="gradeBadge ${missing ? 'missing' : nota <= 4 ? 'danger' : 'warning'}">
      <strong>${escapeHtml(disciplina)}</strong>
      <span>${escapeHtml(formatGrade(missing ? null : nota))}</span>
    </div>
  `).join('');
}

function showStudent(index) {
  if (!filtered.length) {
    studentName.textContent = 'Nenhum aluno encontrado';
    studentClass.textContent = '';
    studentTutor.textContent = '';
    serieBadge.textContent = '';
    matchInfo.textContent = '';

    photoFrame.style.display = 'none';
    studentPhoto.removeAttribute('src');
    studentPhoto.style.display = 'none';
    noPhoto.style.display = 'none';

    renderFrequency({ nome: '', turma: '' });
    renderGrades({ nome: '', turma: '' });
    return;
  }

  currentIndex = (index + filtered.length) % filtered.length;
  const student = filtered[currentIndex];

  serieBadge.textContent = student.serie;
  studentName.textContent = student.nome;
  studentClass.textContent = `Turma ${student.turma}`;
  studentTutor.textContent = student.tutor ? `Tutor(a): ${student.tutor}` : '';

  renderFrequency(student);

  if (student.foto && student.foto.url) {
    photoFrame.style.display = 'flex';
    studentPhoto.src = student.foto.url;
    studentPhoto.style.display = 'block';
    noPhoto.style.display = 'none';
    matchInfo.textContent = `Foto: ${student.foto.nomeArquivo || 'Google Drive'}`;
  } else {
    photoFrame.style.display = 'flex';
    studentPhoto.removeAttribute('src');
    studentPhoto.style.display = 'none';
    noPhoto.style.display = 'block';
    matchInfo.textContent = 'Foto não encontrada no Drive';
  }

  renderGrades(student);
  renderList();
}

function nextStudent() {
  if (!filtered.length) return;
  showStudent(currentIndex + 1);
}

function previousStudent() {
  if (!filtered.length) return;
  showStudent(currentIndex - 1);
}

function randomStudent() {
  if (!filtered.length) return;
  showStudent(Math.floor(Math.random() * filtered.length));
}

document.getElementById('btnNext').onclick = nextStudent;
document.getElementById('btnPrev').onclick = previousStudent;
document.getElementById('btnRandom').onclick = randomStudent;
document.getElementById('btnFullscreen').onclick = () => presentation.requestFullscreen?.();

btnReloadApi.onclick = loadDataFromApi;
turmaSelect.onchange = applyFilters;
searchInput.oninput = applyFilters;

document.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight') nextStudent();
  if (event.key === 'ArrowLeft') previousStudent();
  if (event.key.toLowerCase() === 'f') presentation.requestFullscreen?.();
});

loadDataFromApi();
