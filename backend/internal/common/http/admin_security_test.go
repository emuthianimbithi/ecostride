package http_test

import (
	"bytes"
	"context"
	"ecostride/backend/internal/audit"
	"ecostride/backend/internal/auth"
	"ecostride/backend/internal/bibs"
	httpserver "ecostride/backend/internal/common/http"
	"ecostride/backend/internal/common/models"
	"ecostride/backend/internal/common/testhelpers"
	"ecostride/backend/internal/users"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http/httptest"
	"testing"
)

func TestAdminUsesCurrentAccountAndPermissions(t *testing.T) {
	httpserver.RegisterValidation()
	db := testhelpers.OpenTestDB(t)
	manager := auth.NewManager("test-access", "test-refresh")
	service := auth.NewService(db, manager)
	grant := models.Permission{Slug: uuid.New(), Key: "payment.read"}
	if err := db.Create(&grant).Error; err != nil {
		t.Fatal(err)
	}
	role := models.Role{Slug: uuid.New(), Name: "Reader"}
	if err := db.Create(&role).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&role).Association("Permissions").Replace(&grant); err != nil {
		t.Fatal(err)
	}
	user := models.User{Slug: uuid.New(), Email: "reader@example.com", IsActive: true}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&user).Association("Roles").Replace(&role); err != nil {
		t.Fatal(err)
	}
	token, err := manager.SignAccessToken(user.ID, user.Slug, []string{"payment.read", "payment.refund"})
	if err != nil {
		t.Fatal(err)
	}
	// Login persists the refresh token, so use it for the disable/re-enable test.
	hash, err := auth.HashPassword("test-long-password")
	if err != nil {
		t.Fatal(err)
	}
	db.Model(&user).Update("password_hash", hash)
	tokens, _, err := service.Login(context.Background(), user.Email, "test-long-password")
	if err != nil {
		t.Fatal(err)
	}
	refresh := tokens.RefreshToken
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(httpserver.RequireAuth(manager, service))
	router.GET("/read", httpserver.RequirePermission("payment.read"), func(c *gin.Context) { c.Status(204) })
	raceHandler := bibs.NewHandler(bibs.NewService(db), nil, db)
	router.GET("/race-events", httpserver.RequireAnyPermission("checkin.access", "bib.assign.manual", "bib.assign.auto"), raceHandler.ListRaceEvents)
	router.GET("/registrations", httpserver.RequirePermission("registration.read"), func(c *gin.Context) { c.Status(204) })
	router.GET("/refund", httpserver.RequirePermission("payment.refund"), func(c *gin.Context) { c.Status(204) })
	handler := users.NewHandler(users.NewService(db), audit.NewService(db), db)
	router.PUT("/users/:id", handler.UpdateUser)
	call := func(method, path, body string) int {
		req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := call("GET", "/read", ""); code != 204 {
		profile, _ := service.Profile(context.Background(), user.ID)
		t.Fatalf("active read: %d profile=%+v", code, profile)
	}
	if code := call("GET", "/refund", ""); code != 403 {
		t.Fatalf("stale JWT grant trusted: %d", code)
	}
	if err := db.Model(&user).Association("Roles").Clear(); err != nil {
		t.Fatal(err)
	}
	if code := call("GET", "/read", ""); code != 403 {
		t.Fatalf("removed permission retained: %d", code)
	}
	checkin := models.Permission{Slug: uuid.New(), Key: "checkin.access"}
	if err := db.Create(&checkin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&role).Association("Permissions").Replace(&checkin); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&user).Association("Roles").Replace(&role); err != nil {
		t.Fatal(err)
	}
	if code := call("GET", "/race-events", ""); code != 200 {
		t.Fatalf("check-in staff race lookup: %d", code)
	}
	if code := call("GET", "/registrations", ""); code != 403 {
		t.Fatalf("check-in staff broad registration read: %d", code)
	}
	if code := call("GET", "/read", ""); code != 403 {
		t.Fatalf("check-in staff payment read: %d", code)
	}
	if code := call("PUT", "/users/"+user.Slug.String(), `{"is_active":false}`); code != 200 {
		t.Fatalf("disable: %d", code)
	}
	if code := call("GET", "/read", ""); code != 401 {
		t.Fatalf("disabled access: %d", code)
	}
	db.Model(&user).Update("is_active", true)
	if code := call("GET", "/read", ""); code != 401 {
		t.Fatalf("re-enabled old session revived: %d", code)
	}
	if _, _, err := service.Refresh(context.Background(), refresh); err == nil {
		t.Fatal("revoked refresh token accepted")
	}
	tokens, _, err = service.Login(context.Background(), user.Email, "test-long-password")
	if err != nil {
		t.Fatal(err)
	}
	token = tokens.AccessToken
	if code := call("PUT", "/users/"+user.Slug.String(), `{"password":"replacement-long-password"}`); code != 200 {
		t.Fatalf("password reset: %d", code)
	}
	if code := call("GET", "/read", ""); code != 401 {
		t.Fatalf("old access after password reset: %d", code)
	}
	if _, _, err := service.Refresh(context.Background(), tokens.RefreshToken); err == nil {
		t.Fatal("old refresh after password reset")
	}
}
