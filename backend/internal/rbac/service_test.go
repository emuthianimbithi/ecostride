package rbac

import "testing"

func TestHasPermission(t *testing.T) {
	perms := []string{"event.read", "event.write"}

	if !HasPermission(perms, "event.read") {
		t.Fatal("expected permission")
	}

	if HasPermission(perms, "event.publish") {
		t.Fatal("unexpected permission")
	}
}
