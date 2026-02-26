REGISTRY ?= a1engineer

.PHONY: build build-agent build-agent-claude build-manager build-ergo

## Build all images in dependency order
build: build-agent build-agent-claude build-manager build-ergo

## a1-agent-base: base image for all agent containers
build-agent:
	docker build -t $(REGISTRY)/a1-agent-base:latest -f agent/Dockerfile agent/

## a1-agent-claude: extends base with Claude Code CLI
build-agent-claude: build-agent
	docker build -t $(REGISTRY)/a1-agent-claude:latest -f agent/Dockerfile.claude agent/

## a1-manager: orchestration manager
build-manager:
	docker build -t $(REGISTRY)/a1-manager:latest -f manager/Dockerfile manager/

## a1-ergo: IRC server with bundled config
build-ergo:
	docker build -t $(REGISTRY)/a1-ergo:latest templates/ergo/
