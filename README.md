# Amazon Order History CSV Download MCP

[![GitHub Actions](https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/workflows/Code%20Quality/badge.svg)](https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-0.1.0-blue)](https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/releases)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)
[![AGENTS.md](https://img.shields.io/badge/AGENTS.md-Compliant-blue.svg)](https://agents.md/)

MCP (Model Context Protocol) server for downloading Amazon order history as CSV files.
Supports orders, items, shipments, and transactions export across 16 Amazon regional sites.

## Features

- **4 Export Types**: Orders summary, item details, shipment tracking, payment transactions
- **16 Amazon Regions**: US, UK, Canada, Germany, France, Spain, Italy, and more
- **Browser Automation**: Uses Playwright for reliable data extraction
- **AI Assistant Integration**: Works with Claude, GPT, and other MCP-compatible assistants
- **Flexible Date Ranges**: Export by year, date range, or recent months

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/marcusquinn/amazon-order-history-csv-download-mcp.git
cd amazon-order-history-csv-download-mcp

# Install dependencies
npm install

# Build
npm run build

# Install Playwright browsers
npx playwright install chromium
```

### Configuration

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "amazon-orders": {
      "command": "node",
      "args": ["/path/to/amazon-order-history-csv-download-mcp/dist/index.js"]
    }
  }
}
```

### Usage

Once configured, you can ask your AI assistant:

- "Download my Amazon orders from 2024 as CSV"
- "Export all items I purchased on Amazon UK this year"
- "Get shipment tracking for my recent Amazon orders"
- "Export my Amazon payment transactions for tax purposes"

## Supported Regions

| Region | Domain | Currency |
|--------|--------|----------|
| United States | amazon.com | USD |
| United Kingdom | amazon.co.uk | GBP |
| Canada | amazon.ca | CAD |
| Germany | amazon.de | EUR |
| France | amazon.fr | EUR |
| Spain | amazon.es | EUR |
| Italy | amazon.it | EUR |
| Netherlands | amazon.nl | EUR |
| Japan | amazon.co.jp | JPY |
| Australia | amazon.com.au | AUD |
| Mexico | amazon.com.mx | MXN |
| India | amazon.in | INR |
| UAE | amazon.ae | AED |
| Saudi Arabia | amazon.sa | SAR |
| Ireland | amazon.ie | EUR |
| Belgium | amazon.com.be | EUR |

## Export Types

### Orders (`export_amazon_orders_csv`)

High-level order summary with totals, taxes, and payment info.

| Column | Description |
|--------|-------------|
| order_id | Amazon order identifier |
| date | Order date |
| total | Grand total |
| shipping | Shipping cost |
| tax | Tax amount (VAT/GST/Sales Tax) |
| refund | Refund amount if any |
| recipient | Shipping recipient name |
| payments | Payment method(s) used |

### Items (`export_amazon_items_csv`)

Individual item details with product information.

| Column | Description |
|--------|-------------|
| order_id | Parent order ID |
| date | Order date |
| quantity | Item quantity |
| description | Product title |
| price | Item price |
| asin | Amazon product ID |
| category | Product category |
| delivery_status | Delivery status |

### Shipments (`export_amazon_shipments_csv`)

Shipment and tracking information.

| Column | Description |
|--------|-------------|
| shipment_id | Shipment identifier |
| order_id | Parent order ID |
| status | Delivery status |
| tracking_id | Carrier tracking number |
| tracking_link | Tracking URL |
| delivered | Yes/No/Unknown |

### Transactions (`export_amazon_transactions_csv`)

Payment transaction details for financial reconciliation.

| Column | Description |
|--------|-------------|
| date | Transaction date |
| order_ids | Associated order(s) |
| vendor | Seller name |
| card_details | Payment method |
| amount | Transaction amount |

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Architecture

This project uses a plugin architecture designed for extensibility:

- **Core Framework**: Shared utilities for CSV, dates, currencies, browser automation
- **Platform Plugins**: Amazon-specific extraction logic (future: eBay, AliExpress, etc.)

See [AGENTS.md](AGENTS.md) for detailed architecture documentation.

## Credits

This project was inspired by [AZAD](https://github.com/philipmulcahy/azad), a Chrome
extension for Amazon order history export. This is an original implementation built
as an MCP server - not a fork or derivative work.

See [CREDITS.md](CREDITS.md) for full acknowledgments.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please read [AGENTS.md](AGENTS.md) for development guidelines.
