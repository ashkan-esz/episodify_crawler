# Makefile for Episodify Crawler

# Variables
IMAGE_NAME = episodify-crawler
CONTAINER_NAME = episodify-crawler
DOCKERFILE = docker/Dockerfile
ENV_FILE = .env

# Default target
.DEFAULT_GOAL := help

# Build the Docker image
build:
	@echo "Building Docker image: $(IMAGE_NAME)..."
	@docker buildx build --platform=linux/amd64 \
		--no-cache \
		--network=host \
		-t $(IMAGE_NAME) -f $(DOCKERFILE) .
	@echo "Docker image $(IMAGE_NAME) built successfully."

# Run the application container directly (without Compose)
# Note: This is less common for development as it doesn't start dependencies
run:
	@echo "Running Docker container: $(CONTAINER_NAME)..."
	@docker run --name $(CONTAINER_NAME) --rm \
		--network=host \
		--env-file $(ENV_FILE) \
		$(IMAGE_NAME)
	@echo "Container $(CONTAINER_NAME) started."

# Stop the directly run container
stop:
	@echo "Stopping Docker container: $(CONTAINER_NAME)..."
	@docker stop $(CONTAINER_NAME) || true
	@echo "Container $(CONTAINER_NAME) stopped."

# Start all services defined in docker-compose.yml in detached mode
compose-up:
	@echo "Starting services with Docker Compose..."
	@docker-compose up -d
	@echo "Docker Compose services started."

# Stop and remove all services defined in docker-compose.yml
compose-down:
	@echo "Stopping Docker Compose services..."
	@docker-compose down
	@echo "Docker Compose services stopped."

# View logs for the application service in Docker Compose
compose-logs:
	@echo "Tailing logs for the app service..."
	@docker-compose logs -f app

# Clean up Docker resources (use with caution)
clean: compose-down
	@echo "Removing Docker volumes and stopped containers..."
	@docker volume prune -f
	@docker container prune -f
	@echo "Cleanup complete."

# Show help message
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  build                 Build the Docker image"
	@echo "  run                   Build and run the app container directly (no dependencies)"
	@echo "  stop                  Stop the directly run container"
	@echo "  compose-up            Start all services with Docker Compose (recommended for development)"
	@echo "  compose-down          Stop and remove Docker Compose services"
	@echo "  compose-logs          Tail logs for the 'app' service in Docker Compose"
	@echo "  clean                 Stop services and remove Docker volumes/containers"
	@echo "  help                  Show this help message"

# Phony targets ensure these commands run even if files with the same name exist
.PHONY: build run stop compose-up compose-down compose-logs clean help
