# Amazon Order History CSV Download MCP - AI Assistant Guide

<!-- AI-CONTEXT-START -->
## Quick Reference

- **Purpose**: MCP server for extracting Amazon order history to CSV
- **Export Types**: orders | items | shipments | transactions
- **Regions**: 16 Amazon country sites supported
- **Architecture**: Core framework + platform plugin design

**Key Commands**:
```bash
npm run dev          # Development mode (uses local core)
npm run start        # Production mode (syncs core first)
npm run test         # Run all tests
npm run build        # Compile TypeScript
```

**MCP Tools**:
| Tool | Description |
|------|-------------|
| `get_amazon_orders` | Fetch order history for date range |
| `get_amazon_order_details` | Get details for specific order |
| `export_amazon_orders_csv` | Export orders summary CSV |
| `export_amazon_items_csv` | Export items detail CSV |
| `export_amazon_shipments_csv` | Export shipments/tracking CSV |
| `export_amazon_transactions_csv` | Export payment transactions CSV |
| `check_amazon_auth_status` | Check browser session auth |

**Agents**:
| Agent | File |
|-------|------|
| `@amazon-orders-download` | Orders summary export |
| `@amazon-order-items-download` | Items detail export |
| `@amazon-order-shipments-download` | Shipments/tracking export |
| `@amazon-order-transactions-download` | Transactions export |
<!-- AI-CONTEXT-END -->

## Project Overview

This MCP server enables AI assistants to extract Amazon order history and export
it to CSV format. It uses Playwright for browser automation and supports all
major Amazon regional sites.

### Supported Amazon Regions (16)

| Region | Domain | Currency | Tax Fields |
|--------|--------|----------|------------|
| United States | amazon.com | USD | Sales Tax |
| United Kingdom | amazon.co.uk | GBP | VAT |
| Canada | amazon.ca | CAD | GST, PST |
| Germany | amazon.de | EUR | VAT |
| France | amazon.fr | EUR | VAT |
| Spain | amazon.es | EUR | VAT |
| Italy | amazon.it | EUR | VAT |
| Netherlands | amazon.nl | EUR | VAT |
| Japan | amazon.co.jp | JPY | - |
| Australia | amazon.com.au | AUD | GST |
| Mexico | amazon.com.mx | MXN | IVA |
| India | amazon.in | INR | GST |
| UAE | amazon.ae | AED | VAT |
| Saudi Arabia | amazon.sa | SAR | VAT |
| Ireland | amazon.ie | EUR | VAT |
| Belgium | amazon.com.be | EUR | VAT |

## Architecture

### Core + Plugin Design

```
src/
├── core/                    # Shared framework (future: separate package)
│   ├── types/              # Universal interfaces
│   ├── utils/              # CSV, date, currency utilities
│   ├── browser/            # Playwright automation helpers
│   └── mcp/                # Base MCP server class
├── amazon/                  # Amazon-specific plugin
│   ├── adapter.ts          # IPlatformPlugin implementation
│   ├── regions.ts          # 16 regions configuration
│   └── extractors/         # DOM extraction strategies
└── tools/                   # MCP tool implementations
```

### Core Sync System

The project supports two operational modes:

| Mode | Use Case | Core Location |
|------|----------|---------------|
| Consumer | End users | `src/core/` (bundled, auto-updates) |
| Developer | Contributors | Sibling repo via `CORE_DEV_MODE=true` |

## Development Guidelines

### Shell Script Standards

All shell scripts must follow these rules:
- Every function must have explicit `return 0` or `return 1`
- Never use positional parameters directly - assign to local variables
- Define constants for strings used 3+ times
- Zero ShellCheck violations required

### TypeScript Standards

- Strict mode enabled
- No implicit any
- All functions must have return types
- Use Zod for runtime validation of external data

### Testing Requirements

- Unit tests for all utilities
- Integration tests with HTML fixtures
- Docker-based isolated testing environment
- Minimum 80% code coverage target

## File Structure

```
amazon-order-history-csv-download-mcp/
├── .agent/                  # AI context and scripts
├── .github/workflows/       # CI/CD pipelines
├── .opencode/agent/         # OpenCode agent symlinks
├── configs/                 # Configuration templates
├── scripts/                 # Build and sync scripts
├── src/                     # TypeScript source
├── tests/                   # Test suites
├── AGENTS.md               # This file
├── README.md               # User documentation
├── CHANGELOG.md            # Version history
├── CREDITS.md              # Acknowledgments
└── package.json            # Dependencies
```

## Security

### Credential Storage

- Browser session data stored in `.browser-data/` (gitignored)
- No credentials stored in code or config files
- Session cookies managed by Playwright

### Data Privacy

- Order data processed locally only
- No data sent to external services
- CSV files stored in user-specified locations

## Version Management

All version references must stay synchronized:
- `VERSION` file
- `package.json` version field
- `README.md` badges
- `CHANGELOG.md` headings

## Contributing

See [CREDITS.md](CREDITS.md) for acknowledgments and contribution guidelines.

## Related Projects

- [AZAD](https://github.com/philipmulcahy/azad) - Inspiration (Chrome extension)
- [ecommerce-order-history-csv-download-mcp-core](https://github.com/marcusquinn/ecommerce-order-history-csv-download-mcp-core) - Shared core (future)
