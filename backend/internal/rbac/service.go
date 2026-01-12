package rbac

// HasPermission checks if the permission slice includes the required permission.
func HasPermission(perms []string, required string) bool {
	if required == "" {
		return true
	}

	for _, perm := range perms {
		if perm == required {
			return true
		}
	}

	return false
}
