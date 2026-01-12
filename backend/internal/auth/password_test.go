package auth

import "testing"

func TestHashAndVerifyPassword(t *testing.T) {
	hash, err := HashPassword("s3cret-password")
	if err != nil {
		t.Fatalf("hash failed: %v", err)
	}

	ok, err := VerifyPassword(hash, "s3cret-password")
	if err != nil {
		t.Fatalf("verify failed: %v", err)
	}
	if !ok {
		t.Fatal("expected password to match")
	}

	ok, err = VerifyPassword(hash, "wrong-password")
	if err != nil {
		t.Fatalf("verify failed: %v", err)
	}
	if ok {
		t.Fatal("expected password mismatch")
	}
}
