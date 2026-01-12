package main

import (
	"log"

	"ecostride/backend/internal/common/config"
	"ecostride/backend/internal/common/db"
)

func main() {
	cfg := config.Load()

	conn, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("db connect failed: %v", err)
	}

	if err := db.AutoMigrate(conn); err != nil {
		log.Fatalf("migrate failed: %v", err)
	}

	log.Println("migrations complete")
}
