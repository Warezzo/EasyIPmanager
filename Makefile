# EasyIPmanager — Deploy helpers
# Usage: make <target>
# Run all commands from the repo root.

COMPOSE_DIR := ipam
COMPOSE     := docker compose -f $(COMPOSE_DIR)/docker-compose.yml
CONTAINER   := ipam
BACKUP_DIR  := backups

.DEFAULT_GOAL := help

# ── First-time setup ─────────────────────────────────────────────────────────

.PHONY: setup
setup: ## First-time setup: copy .env.example, generate secrets, start app
	@bash ipam/setup.sh

# ── Core lifecycle ───────────────────────────────────────────────────────────

.PHONY: deploy
deploy: ## Pull image from GHCR and start container (requires .env to exist)
	@$(call check_env)
	$(COMPOSE) pull
	$(COMPOSE) up -d
	@echo "✔  EasyIPmanager running at http://localhost:$${PORT:-5050}"

.PHONY: update
update: ## Pull latest image from GHCR and restart container
	@$(call check_env)
	$(COMPOSE) pull
	$(COMPOSE) up -d
	@docker image prune -f 2>/dev/null || true
	@echo "✔  Update complete — http://localhost:$${PORT:-5050}"

.PHONY: restart
restart: ## Restart container without rebuilding (useful after .env changes)
	@$(call check_env)
	$(COMPOSE) restart

.PHONY: stop
stop: ## Stop and remove the container (data volume is preserved)
	$(COMPOSE) down

.PHONY: destroy
destroy: ## ⚠ Stop container AND delete data volume (irreversible)
	@echo "WARNING: This will delete all data. Press Ctrl+C to cancel, Enter to continue."
	@read _confirm
	$(COMPOSE) down -v

# ── Observability ────────────────────────────────────────────────────────────

.PHONY: logs
logs: ## Follow container logs (Ctrl+C to exit)
	$(COMPOSE) logs -f

.PHONY: status
status: ## Show container status and image info
	$(COMPOSE) ps
	$(COMPOSE) images

# ── Debugging ────────────────────────────────────────────────────────────────

.PHONY: shell
shell: ## Open a bash shell inside the running container
	docker exec -it $(CONTAINER) sh

# ── Backup ───────────────────────────────────────────────────────────────────

.PHONY: backup
backup: ## Copy SQLite DB from container to ./backups/ipam_<timestamp>.db
	@mkdir -p $(BACKUP_DIR)
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
	docker cp $(CONTAINER):/data/ipam.db $(BACKUP_DIR)/ipam_$$TIMESTAMP.db && \
	echo "✔  Backup saved to $(BACKUP_DIR)/ipam_$$TIMESTAMP.db"

# ── Help ─────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help message
	@echo ""
	@echo "  EasyIPmanager — available commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ── Internal helpers ─────────────────────────────────────────────────────────

define check_env
	@if [ ! -f $(COMPOSE_DIR)/.env ]; then \
		echo "ERROR: $(COMPOSE_DIR)/.env not found. Run 'make setup' first."; \
		exit 1; \
	fi
endef
