const test = require('node:test');
const assert = require('node:assert');
const { filterUsers, collectDepartments, buildEmailString } = require('../public/js/user-list.js');

const users = [
    { id: 1, firstname: 'Anna', name: 'Muster', email: 'anna@x.ch', role: 'coach', additional_roles: ['expert'], departments: [{ id: 10, name: 'Informatik' }] },
    { id: 2, firstname: 'Bruno', name: 'Beispiel', email: 'bruno@x.ch', role: 'expert', additional_roles: [], departments: [{ id: 20, name: 'Elektrotechnik' }] },
    { id: 3, firstname: 'Clara', name: 'Test', email: 'clara@x.ch', role: 'student', departments: [{ id: 10, name: 'Informatik' }, { id: 20, name: 'Elektrotechnik' }] },
    { id: 4, firstname: 'Dora', name: 'Ohne', email: '', role: 'coach', departments: [] },
    { id: 5, firstname: 'Emil', name: 'Doppelt', email: 'ANNA@x.ch', role: 'coach', departments: [] },
];
const ids = list => list.map(u => u.id);

test('ohne Kriterien werden alle Benutzer geliefert', () => {
    assert.deepStrictEqual(ids(filterUsers(users, {})), [1, 2, 3, 4, 5]);
});

test('Rollenfilter berücksichtigt Haupt- und Zusatzrollen', () => {
    assert.deepStrictEqual(ids(filterUsers(users, { role: 'expert' })), [1, 2]);
    assert.deepStrictEqual(ids(filterUsers(users, { role: 'coach' })), [1, 4, 5]);
});

test('Fachbereichsfilter vergleicht IDs unabhängig vom Typ', () => {
    assert.deepStrictEqual(ids(filterUsers(users, { departmentId: '10' })), [1, 3]);
});

test('Rolle, Fachbereich und Suche sind UND-verknüpft', () => {
    assert.deepStrictEqual(ids(filterUsers(users, { role: 'expert', departmentId: '20' })), [2]);
    assert.deepStrictEqual(ids(filterUsers(users, { role: 'student', departmentId: '20', query: 'cla' })), [3]);
    assert.deepStrictEqual(ids(filterUsers(users, { role: 'student', departmentId: '20', query: 'anna' })), []);
});

test('Fachbereiche werden eindeutig und nach Name sortiert gesammelt', () => {
    assert.deepStrictEqual(collectDepartments(users).map(d => d.name), ['Elektrotechnik', 'Informatik']);
});

test('E-Mail-String: Semikolon-getrennt, ohne Leere und Duplikate', () => {
    assert.strictEqual(buildEmailString(users, new Set([3, 1, 4, 5])), 'anna@x.ch; clara@x.ch');
    assert.strictEqual(buildEmailString(users, new Set()), '');
});
