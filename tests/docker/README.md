# Docker Test Environment

Containerized test environment for Amazon Order History CSV Download MCP.

## Quick Start

```bash
cd tests/docker

# Run all tests
docker-compose run --rm test

# Run unit tests only
docker-compose run --rm test-unit

# Interactive shell for debugging
docker-compose run --rm shell

# Build fresh
docker-compose build --no-cache
```

## What's Tested

- Unit tests for core utilities (date, currency, CSV)
- Unit tests for Amazon extractors
- Integration tests with HTML fixtures
- TypeScript compilation

## Coverage

Test coverage reports are mounted to `./coverage/` on the host.
