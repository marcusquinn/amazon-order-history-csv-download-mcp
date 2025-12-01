# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2024-12-01

### Added

- Automated release workflow triggered by VERSION file changes
- ESLint configuration (.eslintrc.js) for code quality CI

### Fixed

- ESLint errors: no-constant-condition, prefer-const, no-useless-escape, no-var-requires

### Changed

- Consolidated 4 separate agents into single `@amazon-order-history` agent
- Updated README with Carrier column documentation for shipments CSV

## [0.3.0] - 2024-12-01

### Added

- `fetch_tracking_numbers` option for shipment extraction - visits ship-track pages to get actual carrier tracking numbers (e.g., AZ218181365JE)
- `carrier` field extraction from ship-track pages (e.g., JERSEY_POST, Whistl, Royal Mail)
- `extractTrackingInfoFromPage()` function returning both tracking ID and carrier name
- `validateTrackingNumber()` helper supporting Amazon Logistics (AZ*, TBA*), Royal Mail, Hermes/Evri, DPD formats
- Carrier column in shipments CSV export
- Payment Amount fallback to order total in shipments CSV
- Money parsing unit tests (29 new tests)
- Integration tests with Playwright and HTML fixtures
- Negative amount parsing support for money (-$12.34 and parentheses format)

### Changed

- Improved tool descriptions for clarity on what pages are visited
- All tool responses now include params for debugging
- Carrier extraction uses precise regex patterns to avoid false matches

## [0.2.0] - 2024-12-01

### Added

- UK date format support (e.g., "14 November 2024") alongside US format
- Subscribe & Save frequency extraction from order cards
- UK postcode detection for address line splitting
- Comprehensive tool descriptions for all 11 MCP tools
- Region validation with clear error messages for all tool handlers
- Money parsing tests with multi-currency support
- Negative amount parsing support (-$12.34 and parentheses format)

### Fixed

- Item count extraction now uses container-based counting instead of link counting
- Multi-item invoice extraction handles multiple items within single purchasedItems containers
- ASIN deduplication uses ASIN:name key to preserve product variants
- Address splitting correctly handles UK postcodes mid-line

### Changed

- Streamlined ORDER_CSV_COLUMNS to fields available from order list page
- Streamlined ITEM_CSV_COLUMNS to reliably extractable item data
- Improved tool descriptions with performance estimates and batch size recommendations

### Technical

- Added 30+ new unit tests (52 total)
- Fixed money parser to handle leading negative signs before currency symbols

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

[Unreleased]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/releases/tag/v0.1.0
