# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-11-30

### Added

- Initial project structure
- Core framework with types for orders, items, shipments, transactions
- Amazon platform adapter scaffolding
- Support for 16 Amazon regional sites
- MCP tools: get_amazon_orders, export CSV variants
- 4 specialized agents for different export types
- Playwright browser automation setup
- Jest test framework with Docker support
- GitHub Actions for code quality and testing
- Documentation: README, AGENTS.md, CREDITS.md

### Technical

- TypeScript strict mode configuration
- Core sync system for plugin architecture
- Multi-region date and currency parsing utilities
- XPath extraction strategies for Amazon DOM

[Unreleased]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/releases/tag/v0.1.0
