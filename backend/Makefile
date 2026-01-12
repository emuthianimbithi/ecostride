.PHONY: dev test fmt lint migrate-up migrate-down seed seed-onboarding seed-local seed-demo openapi

dev:
	go run ./cmd/api

test:
	go test ./...

fmt:
	gofmt -w .

lint:
	go vet ./...

migrate-up:
	go run ./cmd/migrate

migrate-down:
	go run ./cmd/migrate -down

seed:
	go run ./cmd/seed

seed-onboarding:
	SEED_PROFILE=onboarding go run ./cmd/seed

seed-local:
	SEED_PROFILE=local go run ./cmd/seed

seed-demo:
	SEED_PROFILE=demo go run ./cmd/seed

openapi:
	@echo "Edit backend/openapi/openapi.yaml (no generator configured)."

