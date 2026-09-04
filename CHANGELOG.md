# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.3] - 2026-09-04

### Added

- Public npm distribution as `amz-order-history-csv-mcp`, including an executable MCP entry point and registry-first setup documentation (#25)

### Security

- npm releases now use keyless GitHub OIDC Trusted Publishing and publish one allowlisted, prepacked artifact (#25)
- Existing-version checks bind npm registry integrity and shasum metadata to the exact release artifact while validating `gitHead` when npm provides it (#25)

## [0.4.2] - 2026-09-04

### Fixed

- Docker CI now uses Compose v2 with a repository-specific project name and reports the container test's real result (#16)

### Changed

- GitHub workflows now pin `actions/checkout` and `actions/setup-node` to verified Node 24-based release commits (#17)
- Release publishing now pins `softprops/action-gh-release` to a verified Node 24-based release commit (#20)

## [0.4.1] - 2026-09-04

### Fixed

- Order exports now honor bounded date ranges that span calendar years and retain already-found orders if authentication expires during traversal (#11)
- Modern invoice, detail, and single-order extraction now binds sparse quantities and seller metadata to each item row (#14)
- Code-quality workflows now use supported action versions (#10)

## [0.4.0] - 2026-09-03

### Added

- Support for Amazon's current APX transactions page, including paginated traversal with the legacy infinite-scroll strategy retained as a fallback (#6, #8)
- `AMAZON_ORDERS_BROWSER_DATA_DIR` configuration for isolated persistent profiles across concurrent Amazon accounts (#2)

### Fixed

- APX transaction extraction now handles browser `NodeList` values and waits for changed rows after the Next action before continuing
- Leading-plus refunds such as `+$93.59` retain their positive amount and regional currency
- Browser sessions recover after the persistent context or page is closed unexpectedly
- Amazon error-banner rows are excluded from transaction exports

### Changed

- Transaction tool descriptions now cover both page and scroll advances
- Expanded related-project documentation and excluded browser-only source from Sonar coverage calculations

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

[Unreleased]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.4.3...HEAD
[0.4.3]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/releases/tag/v0.1.0
