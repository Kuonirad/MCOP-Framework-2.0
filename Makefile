# MCOP Framework 2.0 - Makefile for Reproducibility
# This Makefile provides targets for building, testing, and verifying the project
# Last updated: 2025-12-13

.PHONY: all install lint test build verify clean reproduce help

# Default target
all: install lint test build

# Help target
help:
	@echo "MCOP Framework 2.0 - Available targets:"
	@echo ""
	@echo "  make install   - Install dependencies"
	@echo "  make lint      - Run linting"
	@echo "  make test      - Run tests"
	@echo "  make coverage  - Run tests with coverage"
	@echo "  make build     - Build the application"
	@echo "  make verify    - Run full verification (lint + test + build)"
	@echo "  make reproduce - Clone, verify, and print Q.E.D."
	@echo "  make clean     - Remove build artifacts"
	@echo "  make docker    - Build Docker image"
	@echo "  make docker-verify - Verify build in Docker"
	@echo ""

# Install dependencies
install:
	@echo "Installing dependencies..."
	npm ci
	@echo "Dependencies installed successfully."

# Run linting
lint:
	@echo "Running linter..."
	npm run lint
	@echo "Linting passed."

# Run tests
test:
	@echo "Running tests..."
	npm test
	@echo "Tests passed."

# Run tests with coverage
coverage:
	@echo "Running tests with coverage..."
	npm run test:coverage
	@echo "Coverage report generated."

# Build application
build:
	@echo "Building application..."
	npm run build
	@echo "Build completed successfully."

# Full verification
verify: lint test build
	@echo ""
	@echo "========================================="
	@echo "MCOP Framework 2.0 Verification Complete"
	@echo "========================================="
	@echo "All checks passed:"
	@echo "  - Linting: PASSED"
	@echo "  - Tests: PASSED"
	@echo "  - Build: PASSED"
	@echo ""
	@echo "Q.E.D."
	@echo "========================================="

# Reproducibility target - clones fresh copy and verifies
reproduce:
	@echo "Starting reproducibility verification..."
	@echo "This target verifies the build in a clean environment."
	@echo ""
	@TEMP_DIR=$$(mktemp -d) && \
	echo "Created temporary directory: $$TEMP_DIR" && \
	cd $$TEMP_DIR && \
	git clone https://github.com/KullAILABS/MCOP-Framework-2.0.git && \
	cd MCOP-Framework-2.0 && \
	git checkout $(shell git rev-parse HEAD 2>/dev/null || echo "main") && \
	npm ci && \
	npm run lint && \
	npm test && \
	npm run build && \
	echo "" && \
	echo "=========================================" && \
	echo "MCOP Framework 2.0 Reproducibility Test" && \
	echo "=========================================" && \
	echo "Commit: $(shell git rev-parse HEAD 2>/dev/null || echo "HEAD")" && \
	echo "Date: $(shell date -u +%Y-%m-%dT%H:%M:%SZ)" && \
	echo "" && \
	echo "All verification steps passed." && \
	echo "" && \
	echo "Q.E.D." && \
	echo "=========================================" && \
	rm -rf $$TEMP_DIR

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	rm -rf .next
	rm -rf node_modules
	rm -rf coverage
	@echo "Clean completed."

# Build Docker image
docker:
	@echo "Building Docker image..."
	docker build -t mcop-framework:latest .
	@echo "Docker image built successfully."

# Verify build in Docker
docker-verify:
	@echo "Running verification in Docker..."
	docker build --target verify -t mcop-framework:verify .
	@echo "Docker verification completed."

# Security audit
audit:
	@echo "Running security audit..."
	npm audit --audit-level moderate
	@echo "Security audit completed."

# Development server
dev:
	npm run dev

# Production server
start:
	npm run start
