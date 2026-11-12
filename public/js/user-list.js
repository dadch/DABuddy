// Benutzerliste der Benutzerverwaltung (Admin- und FBL-Dashboard).
// Erwartet im Browser die globalen Bezeichner `allUsersCache` (vom Dashboard
// befüllt), `MGMT_L` (übersetzte Texte), `roleLabel()`, `editUser()` und
// `deleteUser()`. Die reinen Hilfsfunktionen (Filter, E-Mail-String) sind
// zusätzlich für Node-Tests exportiert.
(function (root) {
    'use strict';

    // Rolle prüft Haupt- und Zusatzrollen; Fachbereich prüft die Zuordnung.
    // Alle gesetzten Kriterien müssen erfüllt sein (UND-Verknüpfung).
    function filterUsers(users, { query = '', role = '', departmentId = '' } = {}) {
        const q = String(query || '').trim().toLowerCase();
        return users.filter(u => {
            if (q && !((u.firstname || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q))) {
                return false;
            }
            if (role && u.role !== role && !(u.additional_roles || []).includes(role)) {
                return false;
            }
            if (departmentId && !(u.departments || []).some(d => String(d.id) === String(departmentId))) {
                return false;
            }
            return true;
        });
    }

    // Eindeutige Fachbereiche aller geladenen Benutzer, nach Name sortiert.
    function collectDepartments(users) {
        const byId = new Map();
        users.forEach(u => (u.departments || []).forEach(d => byId.set(String(d.id), d)));
        return Array.from(byId.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }

    // E-Mail-Adressen der ausgewählten Benutzer in Listenreihenfolge,
    // ohne leere Einträge und Duplikate (case-insensitiv), mit "; " getrennt.
    function buildEmailString(users, selectedIds) {
        const seen = new Set();
        const emails = [];
        users.forEach(u => {
            if (!selectedIds.has(u.id)) return;
            const email = String(u.email || '').trim();
            if (!email || seen.has(email.toLowerCase())) return;
            seen.add(email.toLowerCase());
            emails.push(email);
        });
        return emails.join('; ');
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { filterUsers, collectDepartments, buildEmailString };
    }
    if (typeof document === 'undefined') return;

    const selectedUserIds = new Set();

    function escapeHtml(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function val(id) {
        const el = document.getElementById(id);
        return el ? el.value : '';
    }

    function currentFilter() {
        return {
            query: val('userSearchInput'),
            role: val('userRoleFilter'),
            departmentId: val('userDepartmentFilter'),
        };
    }

    // Beim Öffnen der Benutzerverwaltung: Suche, Filter und Auswahl zurücksetzen.
    function resetUserListState() {
        ['userSearchInput', 'userRoleFilter', 'userDepartmentFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        selectedUserIds.clear();
    }

    function populateFilterOptions() {
        const roleSelect = document.getElementById('userRoleFilter');
        if (roleSelect && roleSelect.options.length <= 1) {
            Object.keys(MGMT_L.roles).forEach(key => {
                roleSelect.add(new Option(MGMT_L.roles[key], key));
            });
        }
        const deptSelect = document.getElementById('userDepartmentFilter');
        if (deptSelect) {
            const current = deptSelect.value;
            while (deptSelect.options.length > 1) deptSelect.remove(1);
            collectDepartments(allUsersCache).forEach(d => deptSelect.add(new Option(d.name, d.id)));
            // Gewählten Fachbereich behalten, falls er noch existiert.
            deptSelect.value = Array.from(deptSelect.options).some(o => o.value === current) ? current : '';
        }
    }

    function updateSelectionUi(visibleUsers) {
        const count = selectedUserIds.size;
        const btn = document.getElementById('userEmailExportBtn');
        if (btn) {
            btn.disabled = count === 0;
            document.getElementById('userSelectedCount').textContent = count;
        }
        const clearBtn = document.getElementById('userClearSelectionBtn');
        if (clearBtn) clearBtn.classList.toggle('d-none', count === 0);
        const all = document.getElementById('userSelectAll');
        if (all) {
            const visibleSelected = visibleUsers.filter(u => selectedUserIds.has(u.id)).length;
            all.checked = visibleUsers.length > 0 && visibleSelected === visibleUsers.length;
            all.indeterminate = visibleSelected > 0 && visibleSelected < visibleUsers.length;
        }
    }

    function renderUsersList() {
        // Auswahl von Benutzern bereinigen, die nicht mehr existieren (z. B. gelöscht).
        const existing = new Set(allUsersCache.map(u => u.id));
        Array.from(selectedUserIds).forEach(id => { if (!existing.has(id)) selectedUserIds.delete(id); });

        populateFilterOptions();
        const users = filterUsers(allUsersCache, currentFilter());
        document.getElementById('usersList').innerHTML = `
                <div class="table-responsive">
                    <table class="table table-striped align-middle">
                        <thead>
                            <tr>
                                <th style="width: 2.5rem">
                                    <input type="checkbox" class="form-check-input" id="userSelectAll"
                                           title="${escapeHtml(MGMT_L.userSelectAll)}" aria-label="${escapeHtml(MGMT_L.userSelectAll)}"
                                           onchange="toggleAllVisibleUsers(this.checked)">
                                </th>
                                <th>${MGMT_L.userUsername}</th>
                                <th>${MGMT_L.userName}</th>
                                <th>${MGMT_L.userEmail}</th>
                                <th>${MGMT_L.userRole}</th>
                                <th>${MGMT_L.userDepartments}</th>
                                <th>${MGMT_L.actions}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(user => `
                                <tr>
                                    <td>
                                        <input type="checkbox" class="form-check-input"
                                               aria-label="${escapeHtml(user.email)}"
                                               ${selectedUserIds.has(user.id) ? 'checked' : ''}
                                               onchange="toggleUserSelection(${user.id}, this.checked)">
                                    </td>
                                    <td>${escapeHtml(user.username)}</td>
                                    <td>${escapeHtml(user.name)}, ${escapeHtml(user.firstname)}</td>
                                    <td>${escapeHtml(user.email)}</td>
                                    <td><span class="badge bg-secondary">${escapeHtml(roleLabel(user.role))}</span></td>
                                    <td>
                                        ${user.departments && user.departments.length > 0
                                            ? user.departments.map(dept => `<span class="badge bg-info me-1">${escapeHtml(dept.name)}</span>`).join('')
                                            : `<span class="text-muted">${MGMT_L.userNoDepartments}</span>`}
                                    </td>
                                    <td>
                                        <button class="btn btn-outline-primary btn-sm me-1" onclick="editUser(${user.id})">
                                            <i class="bi bi-pencil"></i>
                                        </button>
                                        <button class="btn btn-outline-danger btn-sm" onclick="deleteUser(${user.id})">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('') || `<tr><td colspan="7" class="text-center text-muted">${MGMT_L.userNotFound}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            `;
        updateSelectionUi(users);
    }

    function toggleUserSelection(id, checked) {
        if (checked) selectedUserIds.add(id); else selectedUserIds.delete(id);
        updateSelectionUi(filterUsers(allUsersCache, currentFilter()));
    }

    // Betrifft nur die aktuell sichtbaren (gefilterten) Benutzer.
    function toggleAllVisibleUsers(checked) {
        filterUsers(allUsersCache, currentFilter()).forEach(u => {
            if (checked) selectedUserIds.add(u.id); else selectedUserIds.delete(u.id);
        });
        renderUsersList();
    }

    function clearUserSelection() {
        selectedUserIds.clear();
        renderUsersList();
    }

    function openUserEmailExport() {
        const text = buildEmailString(allUsersCache, selectedUserIds);
        const area = document.getElementById('userEmailExportText');
        area.value = text;
        document.getElementById('userEmailExportCount').textContent =
            text ? text.split('; ').length : 0;
        document.getElementById('userEmailExportCopied').classList.add('d-none');
        const modalEl = document.getElementById('userEmailExportModal');
        modalEl.addEventListener('shown.bs.modal', () => { area.focus(); area.select(); }, { once: true });
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    function copyUserEmails() {
        const area = document.getElementById('userEmailExportText');
        const done = () => document.getElementById('userEmailExportCopied').classList.remove('d-none');
        area.select();
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(area.value).then(done, () => { if (document.execCommand('copy')) done(); });
        } else if (document.execCommand('copy')) {
            done();
        }
    }

    Object.assign(root, {
        renderUsersList,
        resetUserListState,
        toggleUserSelection,
        toggleAllVisibleUsers,
        clearUserSelection,
        openUserEmailExport,
        copyUserEmails,
    });
})(typeof window !== 'undefined' ? window : globalThis);
