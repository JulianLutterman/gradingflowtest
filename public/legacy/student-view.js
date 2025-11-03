// student-view.js
// Flat custom dropdown (no initial-letter headers). Supports:
// - View All
// - Multi-select (checkboxes)
// - Single-select (exactly one)
// - Newly added student is appended to existing selection (unless "All").

/* STATE */
window.studentViewState = window.studentViewState || {
    mode: 'all',            // 'all' | 'multi' | 'single'
    selectedIds: new Set(), // string IDs
    userInteracted: false,  // NEW: only show "pressed" after user touches the control
};

/* Helpers */
function _getAllStudents() {
    return (typeof _collectCurrentStudents === 'function') ? _collectCurrentStudents() : [];
}

function _syncDropdownButtonVisual() {
    const btn = document.getElementById('studentViewBtn');
    const menu = document.getElementById('studentViewMenu');
    if (!btn || !menu) return;

    const isOpen = menu.classList.contains('show');
    btn.classList.toggle('is-open', isOpen);

    // Pressed look ONLY when the menu is open AND user has interacted AND mode is "all"
    const showActive = isOpen && window.studentViewState.userInteracted && window.studentViewState.mode === 'all';
    btn.classList.toggle('is-active', showActive);
}

function _setStudentViewVisibility(hasStudents) {
    const wrap = document.getElementById('studentViewDropdown');
    const btn = document.getElementById('studentViewBtn');
    const target = wrap || btn; // prefer wrapping div if present
    if (!target) return;
    target.classList.toggle('hidden', !hasStudents);
}



function _normalizeModeFromSelection() {
    const size = window.studentViewState.selectedIds.size;
    if (size === 0) window.studentViewState.mode = 'all';
    else if (size === 1) window.studentViewState.mode = 'single';
    else window.studentViewState.mode = 'multi';
}

/* Build flat dropdown */
function buildStudentViewSelector() {
    const btn = document.getElementById('studentViewBtn');
    const menu = document.getElementById('studentViewMenu');
    if (!btn || !menu) return;

    const students = _getAllStudents()
        .slice()
        .sort((a, b) =>
            (a.full_name || '').localeCompare(b.full_name || '') ||
            (a.student_number || '').localeCompare(b.student_number || '')
        );

    // Show/hide control based on availability
    _setStudentViewVisibility(students.length > 0);

    // If there are no students, make sure the menu is closed and stop here
    if (students.length === 0) {
        menu.classList.remove('show');
        _syncDropdownButtonVisual();
        return;
    }

    // Merge “new student after reload” into existing selection (unless "All")
    const newId = window.__selectStudentAfterReload || null;
    if (newId) {
        if (window.studentViewState.mode !== 'all') {
            window.studentViewState.selectedIds.add(String(newId));
            _normalizeModeFromSelection();
        }
        delete window.__selectStudentAfterReload;
    }

    // Build menu contents
    menu.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'dropdown-header';
    header.innerHTML = `
    <label class="dropdown-label">
      <input type="checkbox" id="allStudentsToggle">
      <span>View All Students</span>
    </label>
  `;
    menu.appendChild(header);

    const allToggle = header.querySelector('#allStudentsToggle');
    allToggle.checked = (window.studentViewState.mode === 'all' || window.studentViewState.selectedIds.size === 0);

    const list = document.createElement('div');
    list.className = 'dropdown-list';
    menu.appendChild(list);

    students.forEach(s => {
        const id = String(s.id);
        const name = s.full_name || 'Unnamed';
        const num = s.student_number || 'No number';

        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `
      <label>
        <input type="checkbox" class="student-checkbox" value="${id}">
        <span>${name} (${num})</span>
      </label>
    `;
        const cb = item.querySelector('.student-checkbox');

        cb.checked = window.studentViewState.mode !== 'all' && window.studentViewState.selectedIds.has(id);

        cb.addEventListener('change', () => {
            window.studentViewState.userInteracted = true;
            if (cb.checked) window.studentViewState.selectedIds.add(id);
            else window.studentViewState.selectedIds.delete(id);

            allToggle.checked = false;
            _normalizeModeFromSelection();
            updateDropdownBtnText();
            applyStudentFilter();
            _syncDropdownButtonVisual();
        });

        list.appendChild(item);
    });

    // All toggle behavior
    allToggle.addEventListener('change', () => {
        window.studentViewState.userInteracted = true;
        if (allToggle.checked) {
            window.studentViewState.mode = 'all';
            window.studentViewState.selectedIds.clear();
            menu.querySelectorAll('.student-checkbox').forEach(cb => (cb.checked = false));
        } else {
            if (window.studentViewState.selectedIds.size === 0) {
                allToggle.checked = true;
                window.studentViewState.mode = 'all';
            }
        }
        updateDropdownBtnText();
        applyStudentFilter();
        _syncDropdownButtonVisual();
    });

    // Toggle/open menu + outside click
    btn.onclick = (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
        window.studentViewState.userInteracted = true;
        _syncDropdownButtonVisual();
    };
    document.addEventListener('click', (e) => {
        const wrap = document.getElementById('studentViewDropdown');
        if (wrap && !wrap.contains(e.target)) {
            menu.classList.remove('show');
            _syncDropdownButtonVisual();
        }
    });

    updateDropdownBtnText();
}


/* Button label */
function updateDropdownBtnText() {
    const btn = document.getElementById('studentViewBtn');
    if (!btn) return;

    const mode = window.studentViewState.mode;
    const size = window.studentViewState.selectedIds.size;

    if (mode === 'all' || size === 0) {
        btn.textContent = 'View All Students';
        _syncDropdownButtonVisual();
        return;
    }

    if (size === 1) {
        const id = [...window.studentViewState.selectedIds][0];
        const s = _getAllStudents().find(x => String(x.id) === String(id));
        if (s) {
            const name = s.full_name || 'Student';
            const num = s.student_number ? ` (${s.student_number})` : '';
            btn.textContent = `${name}${num}`;
        } else {
            btn.textContent = '1 student selected';
        }
        _syncDropdownButtonVisual();
        return;
    }

    btn.textContent = `${size} students selected`;
    _syncDropdownButtonVisual();
}


/* Filter application */
function applyStudentFilter() {
    const mode = window.studentViewState.mode;
    const ids = window.studentViewState.selectedIds;

    const allDetails = document.querySelectorAll('.student-answer-dropdown');
    const addButtons = document.querySelectorAll('.add-student-btn');
    const summaryCtrls = document.querySelectorAll('.student-summary-controls');

    if (mode === 'all') {
        document.body.classList.remove('single-student-view');
        allDetails.forEach(d => {
            d.classList.remove('hidden-by-filter');
            d.open = false;
        });
        addButtons.forEach(btn => btn.classList.remove('hidden'));
        summaryCtrls.forEach(el => el.classList.remove('hidden'));
        return;
    }

    if (mode === 'multi') {
        document.body.classList.remove('single-student-view');
        allDetails.forEach(d => {
            const sid = d.dataset.studentId;
            const show = ids.has(String(sid));
            d.classList.toggle('hidden-by-filter', !show);
            if (show) d.open = false;
        });
        addButtons.forEach(btn => btn.classList.remove('hidden'));
        summaryCtrls.forEach(el => el.classList.remove('hidden'));
        return;
    }

    // SINGLE
    document.body.classList.add('single-student-view');
    const selectedId = [...ids][0];

    allDetails.forEach(d => {
        const sid = d.dataset.studentId;
        const isTarget = String(sid) === String(selectedId);
        d.classList.toggle('hidden-by-filter', !isTarget);
        d.open = isTarget; // ensure visible
    });

    // Disable student-info add/edit/delete in single mode
    addButtons.forEach(btn => btn.classList.add('hidden'));
    summaryCtrls.forEach(el => el.classList.add('hidden'));
}

/* Public API: call after renderExam() */
function refreshStudentView() {
    buildStudentViewSelector();
    applyStudentFilter();
}

// Expose
window.refreshStudentView = refreshStudentView;
window.applyStudentFilter = applyStudentFilter;
