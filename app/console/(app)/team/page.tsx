'use client'

import { useEffect, useState } from 'react'
import { consoleFetch } from '@/lib/console-api'
import { useMe } from '@/features/console/StaffContext'
import type { StaffMember, StaffRole } from '@/types/domain'

const ROLE_LABEL: Record<StaffRole, string> = { supervisor: 'Supervisor', agent: 'Agent' }

const emptyForm = { full_name: '', email: '', password: '', role: 'agent' as StaffRole }

export default function TeamPage() {
  const me = useMe()
  const [users, setUsers] = useState<StaffMember[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const json = await consoleFetch('/api/v2/users')
      setUsers(json.users || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the team.')
    } finally {
      setLoaded(true)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function addUser() {
    setError(null)
    setNotice(null)
    setSaving(true)
    try {
      await consoleFetch('/api/v2/users', { method: 'POST', body: JSON.stringify(form) })
      setNotice(`${form.full_name} can now sign in with ${form.email} and the password you set.`)
      setForm(emptyForm)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add team member.')
    } finally {
      setSaving(false)
    }
  }

  async function patch(user: StaffMember, body: Record<string, unknown>, done: string) {
    setError(null)
    setNotice(null)
    setBusyId(user.user_id)
    try {
      await consoleFetch(`/api/v2/users/${user.user_id}`, { method: 'PATCH', body: JSON.stringify(body) })
      setNotice(done)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update team member.')
    } finally {
      setBusyId(null)
    }
  }

  function resetPassword(user: StaffMember) {
    const password = window.prompt(`New password for ${user.full_name || user.email} (at least 8 characters):`)
    if (!password) return
    void patch(user, { password }, `Password updated for ${user.full_name || user.email}. Share it with them privately.`)
  }

  return (
    <div>
      <h1 className="ll-h1">Team</h1>
      <p className="ll-sub">
        Supervisors see every request and can assign them. Agents see the requests they create plus the ones assigned
        to them.
      </p>
      {error && <div className="ll-error">{error}</div>}
      {notice && <div className="ll-ok">{notice}</div>}

      <table className="ll-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const self = u.user_id === me.id
            const busy = busyId === u.user_id
            const name = u.full_name || u.email
            return (
              <tr key={u.user_id}>
                <td>
                  <div>
                    {name}
                    {self ? ' (you)' : ''}
                  </div>
                  <div className="ll-muted">{u.email}</div>
                </td>
                <td>
                  <select
                    value={u.role}
                    disabled={busy || self}
                    onChange={(e) =>
                      void patch(u, { role: e.target.value }, `${name} is now ${ROLE_LABEL[e.target.value as StaffRole]}.`)
                    }
                  >
                    <option value="agent">Agent</option>
                    <option value="supervisor">Supervisor</option>
                  </select>
                </td>
                <td>
                  <span className={`ll-pill ${u.active ? 'sold' : 'expired'}`}>{u.active ? 'Active' : 'Deactivated'}</span>
                </td>
                <td>
                  <div className="ll-row" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="ll-btn secondary" disabled={busy} onClick={() => resetPassword(u)}>
                      Set password
                    </button>
                    {!self &&
                      (u.active ? (
                        <button
                          type="button"
                          className="ll-btn danger"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(`Deactivate ${name}? They will no longer be able to sign in.`)) {
                              void patch(u, { active: false }, `${name} can no longer sign in. Reassign their requests if needed.`)
                            }
                          }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ll-btn secondary"
                          disabled={busy}
                          onClick={() => void patch(u, { active: true }, `${name} can sign in again.`)}
                        >
                          Reactivate
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            )
          })}
          {users.length === 0 && !error ? (
            <tr>
              <td colSpan={4} className="ll-muted" style={{ textAlign: 'center' }}>
                {loaded ? 'No team members yet.' : 'Loading team…'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <div className="ll-card" style={{ marginTop: 24 }}>
        <h3>Add a team member</h3>
        <p className="ll-muted">
          This creates their login straight away. Share the email and password with them; they can change the password
          from Settings after signing in.
        </p>
        <div className="ll-form" style={{ marginTop: 16 }}>
          <label>
            Full name
            <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </label>
          <label>
            Temporary password
            <input
              type="text"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="At least 8 characters"
            />
          </label>
          <label>
            Role
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffRole }))}>
              <option value="agent">Agent: own and assigned requests</option>
              <option value="supervisor">Supervisor: everything, including Team</option>
            </select>
          </label>
          <button
            type="button"
            className="ll-btn"
            disabled={saving || !form.full_name.trim() || !form.email.trim() || form.password.length < 8}
            onClick={() => void addUser()}
          >
            {saving ? 'Adding…' : 'Add team member'}
          </button>
        </div>
      </div>
    </div>
  )
}
