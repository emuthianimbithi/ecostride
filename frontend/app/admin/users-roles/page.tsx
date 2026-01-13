"use client"

import { useEffect, useMemo, useState } from "react"
import { apiGet, apiPost } from "../../../lib/api-client"
import { useToast } from "../../../components/toast"

type Role = {
  slug: string
  name: string
  description: string
  permissions?: Permission[]
}

type Permission = {
  key: string
  description: string
}

type User = {
  slug: string
  name: string
  email: string
  is_active: boolean
  roles?: Role[]
}

// Group permissions by domain for better organization
function groupPermissionsByDomain(permissions: Permission[]): Record<string, Permission[]> {
  const groups: Record<string, Permission[]> = {}
  for (const perm of permissions) {
    const domain = perm.key.split(".")[0] || "other"
    if (!groups[domain]) groups[domain] = []
    groups[domain].push(perm)
  }
  return groups
}

// Domain label mapping
const domainLabels: Record<string, string> = {
  cms: "Content Management",
  event: "Events",
  registration: "Registrations",
  payment: "Payments",
  finance: "Finance",
  bib: "Bibs",
  results: "Results",
  sponsor: "Sponsors",
  volunteer: "Volunteers",
  shop: "Shop",
  checkin: "Check-In",
  user: "User Management",
  audit: "Audit"
}

// Icon components
function EditIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  )
}

function UserPlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )
}

export default function Page() {
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)
  const [permSearch, setPermSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users")

  const [newUser, setNewUser] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    roleSlugs: [] as string[]
  })

  const [newRole, setNewRole] = useState({
    name: "",
    description: "",
    permissionKeys: [] as string[]
  })

  const [assignModal, setAssignModal] = useState<{ user: User } | null>(null)
  const [assignRoleSlugs, setAssignRoleSlugs] = useState<string[]>([])

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersData, rolesData, permissionsData] = await Promise.all([
        apiGet<User[]>("/admin/users"),
        apiGet<Role[]>("/admin/roles"),
        apiGet<Permission[]>("/admin/permissions")
      ])
      setUsers(usersData)
      setRoles(rolesData)
      setPermissions(permissionsData)
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to load", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const groupedPermissions = useMemo(() => groupPermissionsByDomain(permissions), [permissions])

  const filteredGroupedPermissions = useMemo(() => {
    if (!permSearch.trim()) return groupedPermissions
    const search = permSearch.toLowerCase()
    const filtered: Record<string, Permission[]> = {}
    for (const [domain, perms] of Object.entries(groupedPermissions)) {
      const matching = perms.filter(
        (p) => p.key.toLowerCase().includes(search) || p.description.toLowerCase().includes(search)
      )
      if (matching.length > 0) filtered[domain] = matching
    }
    return filtered
  }, [groupedPermissions, permSearch])

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast({ title: "Name, email, and password are required.", variant: "destructive" })
      return
    }
    try {
      await apiPost("/admin/users", {
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        password: newUser.password,
        role_slugs: newUser.roleSlugs
      })
      toast({ title: "User created", variant: "success" })
      setNewUser({ name: "", email: "", phone: "", password: "", roleSlugs: [] })
      await loadData()
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to create user", variant: "destructive" })
    }
  }

  const handleCreateRole = async () => {
    if (!newRole.name) {
      toast({ title: "Role name is required.", variant: "destructive" })
      return
    }
    try {
      await apiPost("/admin/roles", {
        name: newRole.name,
        description: newRole.description,
        permission_keys: newRole.permissionKeys
      })
      toast({ title: "Role created", variant: "success" })
      setNewRole({ name: "", description: "", permissionKeys: [] })
      await loadData()
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to create role", variant: "destructive" })
    }
  }

  const handleAssignRoles = async () => {
    if (!assignModal) return
    try {
      await apiPost(`/admin/users/${assignModal.user.slug}/roles`, {
        role_slugs: assignRoleSlugs
      })
      toast({ title: "Roles updated", variant: "success" })
      setAssignModal(null)
      await loadData()
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Failed to update roles", variant: "destructive" })
    }
  }

  const openAssignModal = (user: User) => {
    setAssignModal({ user })
    setAssignRoleSlugs((user.roles ?? []).map((r) => r.slug))
  }

  const toggleAllInDomain = (domain: string, checked: boolean) => {
    const domainPerms = groupedPermissions[domain] ?? []
    const domainKeys = domainPerms.map((p) => p.key)
    if (checked) {
      setNewRole((prev) => ({
        ...prev,
        permissionKeys: [...new Set([...prev.permissionKeys, ...domainKeys])]
      }))
    } else {
      setNewRole((prev) => ({
        ...prev,
        permissionKeys: prev.permissionKeys.filter((k) => !domainKeys.includes(k))
      }))
    }
  }

  if (loading) {
    return (
      <main className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-slate-200" />
          <div className="h-64 rounded-2xl bg-slate-200" />
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-forest">Users & Roles</h1>
        <p className="text-sm text-slate-600">Manage admin accounts and permissions.</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium ${activeTab === "users" ? "border-b-2 border-forest text-forest" : "text-slate-500"}`}
        >
          Users ({users.length})
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`px-4 py-2 text-sm font-medium ${activeTab === "roles" ? "border-b-2 border-forest text-forest" : "text-slate-500"}`}
        >
          Roles ({roles.length})
        </button>
      </div>

      {activeTab === "users" && (
        <>
          {/* Create User Form */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Create User</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Name"
              />
              <input
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Email"
              />
              <input
                value={newUser.phone}
                onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Phone"
              />
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Password"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-2">Assign Roles</label>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <label key={role.slug} className="flex items-center gap-1.5 text-sm bg-slate-50 rounded-lg px-2 py-1">
                    <input
                      type="checkbox"
                      checked={newUser.roleSlugs.includes(role.slug)}
                      onChange={(e) => {
                        const roleSlugs = e.target.checked
                          ? [...newUser.roleSlugs, role.slug]
                          : newUser.roleSlugs.filter((s) => s !== role.slug)
                        setNewUser({ ...newUser, roleSlugs })
                      }}
                    />
                    <span>{role.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateUser}
              className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
            >
              Create user
            </button>
          </section>

          {/* Users Table */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-800">Current Users</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">Name</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Roles</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.slug}>
                      <td className="py-2 font-medium text-slate-800">{user.name}</td>
                      <td className="text-slate-600">{user.email}</td>
                      <td>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${user.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="text-slate-600">
                        {(user.roles ?? []).map((role) => (
                          <span key={role.slug} className="mr-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                            {role.name}
                          </span>
                        ))}
                        {(user.roles ?? []).length === 0 && <span className="text-slate-400">None</span>}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => openAssignModal(user)}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-forest"
                          title="Assign roles"
                          aria-label="Assign roles"
                        >
                          <UserPlusIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "roles" && (
        <>
          {/* Create Role Form */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Create Role</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Role name"
              />
              <input
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Description"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-slate-500">
                  Permissions ({newRole.permissionKeys.length} selected)
                </label>
                <input
                  type="text"
                  value={permSearch}
                  onChange={(e) => setPermSearch(e.target.value)}
                  placeholder="Search permissions..."
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs w-48"
                />
              </div>
              <div className="max-h-64 overflow-y-auto space-y-3">
                {Object.entries(filteredGroupedPermissions).map(([domain, perms]) => {
                  const allSelected = perms.every((p) => newRole.permissionKeys.includes(p.key))
                  const someSelected = perms.some((p) => newRole.permissionKeys.includes(p.key))
                  return (
                    <div key={domain} className="border border-slate-100 rounded-lg p-2">
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                          onChange={(e) => toggleAllInDomain(domain, e.target.checked)}
                        />
                        <span className="text-xs font-semibold text-slate-700">
                          {domainLabels[domain] || domain.toUpperCase()} ({perms.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1 pl-5">
                        {perms.map((perm) => (
                          <label key={perm.key} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={newRole.permissionKeys.includes(perm.key)}
                              onChange={(e) => {
                                const permissionKeys = e.target.checked
                                  ? [...newRole.permissionKeys, perm.key]
                                  : newRole.permissionKeys.filter((k) => k !== perm.key)
                                setNewRole({ ...newRole, permissionKeys })
                              }}
                            />
                            <span className="text-slate-600" title={perm.description}>{perm.key}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <button
              onClick={handleCreateRole}
              className="rounded-full border border-forest/30 px-4 py-2 text-sm font-semibold text-forest"
            >
              Create role
            </button>
          </section>

          {/* Roles Table */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-800">Current Roles</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">Role</th>
                    <th>Description</th>
                    <th>Permissions</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roles.map((role) => (
                    <tr key={role.slug}>
                      <td className="py-2 font-medium text-slate-800">{role.name}</td>
                      <td className="text-slate-600">{role.description}</td>
                      <td>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                          <ShieldIcon />
                          {role.permissions?.length ?? 0} permissions
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-forest"
                          title="Edit role"
                          aria-label="Edit role"
                        >
                          <EditIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Assign Roles Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800">
              Assign Roles to {assignModal.user.name}
            </h3>
            <div className="mt-4 space-y-2">
              {roles.map((role) => (
                <label key={role.slug} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assignRoleSlugs.includes(role.slug)}
                    onChange={(e) => {
                      setAssignRoleSlugs(
                        e.target.checked
                          ? [...assignRoleSlugs, role.slug]
                          : assignRoleSlugs.filter((s) => s !== role.slug)
                      )
                    }}
                  />
                  <span className="font-medium">{role.name}</span>
                  <span className="text-slate-500">({role.permissions?.length ?? 0} permissions)</span>
                </label>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setAssignModal(null)}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignRoles}
                className="rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
