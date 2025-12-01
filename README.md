# Amazon Order History CSV Download MCP

[![GitHub Actions](https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/workflows/Code%20Quality/badge.svg)](https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-0.3.0-blue)](https://github.com/marcusquinn/amazon-order-history-csv-download-mcp/releases)
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
- "What's my Amazon gift card balance?"
- "Show me all my Amazon transactions from last month"

## Supported Regions

| Region         | Domain        | Currency |
| -------------- | ------------- | -------- |
| United States  | amazon.com    | USD      |
| United Kingdom | amazon.co.uk  | GBP      |
| Canada         | amazon.ca     | CAD      |
| Germany        | amazon.de     | EUR      |
| France         | amazon.fr     | EUR      |
| Spain          | amazon.es     | EUR      |
| Italy          | amazon.it     | EUR      |
| Netherlands    | amazon.nl     | EUR      |
| Japan          | amazon.co.jp  | JPY      |
| Australia      | amazon.com.au | AUD      |
| Mexico         | amazon.com.mx | MXN      |
| India          | amazon.in     | INR      |
| UAE            | amazon.ae     | AED      |
| Saudi Arabia   | amazon.sa     | SAR      |
| Ireland        | amazon.ie     | EUR      |
| Belgium        | amazon.com.be | EUR      |

## Export Types

### Orders (`export_amazon_orders_csv`)

Fast order summary from the order list page (~0.5s per 10 orders). Best for browsing and basic reporting.

| Column           | Description                                   |
| ---------------- | --------------------------------------------- |
| Order ID         | Amazon order identifier (XXX-XXXXXXX-XXXXXXX) |
| Order Date       | Date order was placed (YYYY-MM-DD)            |
| Total            | Order total amount                            |
| Status           | Delivery status (Delivered, Shipped, etc.)    |
| Items            | Number of items in order                      |
| Address Line 1-7 | Shipping address (up to 7 lines)              |
| Subscribe & Save | Subscription frequency if applicable          |
| Platform         | Always "amazon"                               |
| Region           | Amazon region code (us, uk, de, etc.)         |
| Order URL        | Link to order details page                    |

### Items (`export_amazon_items_csv`)

Detailed item-level export with full order context (~2s per order). Best for expense tracking and accounting.

| Column            | Description                        |
| ----------------- | ---------------------------------- |
| Order ID          | Parent order identifier            |
| Order Date        | Date order was placed              |
| ASIN              | Amazon product identifier          |
| Product Name      | Full product title                 |
| Condition         | New, Used, etc.                    |
| Quantity          | Number of units                    |
| Unit Price        | Price per item                     |
| Item Total        | Quantity × Unit Price              |
| Seller            | Seller/merchant name               |
| Subscribe & Save  | Subscription frequency             |
| Order Subtotal    | Pre-tax/shipping subtotal          |
| Order Shipping    | Shipping cost                      |
| Order Tax         | Sales tax amount                   |
| Order VAT         | VAT amount (UK/EU)                 |
| Order Promotion   | Discount amount                    |
| Order Total       | Final order total                  |
| Order Grand Total | Including all fees                 |
| Order Status      | Delivery status                    |
| Recipient         | Ship-to name                       |
| Address Line 1-7  | Full shipping address              |
| Payment Method    | Card type (Visa, Mastercard, etc.) |
| Card Last 4       | Last 4 digits of card              |
| Product URL       | Link to product page               |
| Image URL         | Product image URL                  |
| Order URL         | Link to order details              |
| Region            | Amazon region code                 |

### Shipments (`export_amazon_shipments_csv`)

Shipment and tracking information (~4s per order). Best for delivery tracking.

| Column            | Description                |
| ----------------- | -------------------------- |
| Order ID          | Parent order identifier    |
| Order Date        | Date order was placed      |
| Shipment ID       | Unique shipment identifier |
| Status            | Shipment status text       |
| Delivered         | Yes/No/Unknown             |
| Tracking ID       | Carrier tracking number    |
| Tracking URL      | Link to carrier tracking   |
| Items in Shipment | Number of items            |
| Item Names        | List of product names      |
| Payment Amount    | Amount charged             |
| Refund            | Refund amount if any       |
| Region            | Amazon region code         |

### Transactions (`export_amazon_transactions_csv`)

Payment transaction details for financial reconciliation.

| Column           | Description         |
| ---------------- | ------------------- |
| Transaction Date | Date of charge      |
| Order ID(s)      | Associated order(s) |
| Payment Method   | Card/payment type   |
| Card Info        | Last 4 digits       |
| Amount           | Transaction amount  |
| Currency         | Currency code       |

### Gift Cards (`export_amazon_gift_cards_csv`)

Gift card activity and balance history.

| Column          | Description               |
| --------------- | ------------------------- |
| Date            | Transaction date          |
| Description     | Activity description      |
| Type            | added/applied/refund      |
| Amount          | Transaction amount        |
| Closing Balance | Balance after transaction |
| Order ID        | Associated order if any   |
| Claim Code      | Gift card claim code      |
| Serial Number   | Gift card serial number   |
| Currency        | Currency code             |
| Region          | Amazon region code        |

## Additional Tools

### Query Tools

| Tool                                | Description                                   |
| ----------------------------------- | --------------------------------------------- |
| `get_amazon_orders`                 | Fetch orders with optional items/shipments    |
| `get_amazon_order_details`          | Get full details for a specific order         |
| `get_amazon_transactions`           | Fetch all transactions from transactions page |
| `get_amazon_gift_card_balance`      | Get current balance and history               |
| `get_amazon_gift_card_transactions` | Get detailed gift card activity               |
| `check_amazon_auth_status`          | Check if browser is logged in                 |

### Transactions Page (`get_amazon_transactions`)

Extracts ALL payment transactions from Amazon's dedicated transactions page (`/cpe/yourpayments/transactions`). Much faster than extracting from individual order pages.

```json
{
  "region": "us",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31"
}
```

### Gift Card Balance (`get_amazon_gift_card_balance`)

Gets your current Amazon gift card balance and recent activity from `/gc/balance`.

```json
{
  "region": "us"
}
```

Returns:

- Current balance
- Recent gift card activity (credits/debits)
- Associated order IDs

### Authentication Check (`check_amazon_auth_status`)

Verify if the browser session is authenticated before running exports.

```json
{
  "region": "uk"
}
```

Returns authentication status, username if logged in, or login URL if not.

## Timeouts & Large Order Histories

When exporting large order histories (100+ orders), the extraction process can take several minutes. MCP clients typically have timeout limits that may need adjustment.

### Estimated Processing Times

| Orders | Estimated Time |
| ------ | -------------- |
| 10     | ~15 seconds    |
| 50     | ~1.5 minutes   |
| 100    | ~3 minutes     |
| 500    | ~15 minutes    |

### Recommendations

1. **Use `max_orders` parameter** to limit extraction scope
2. **Export by year** rather than entire history
3. **Configure client timeouts** if needed (see below)

### Client Timeout Configuration

For OpenCode/Claude Desktop, the timeout is typically set in the MCP client configuration. If you see `MCP error -32001: Maximum total timeout exceeded`, you may need to:

1. Use smaller batches with `max_orders`
2. Configure your MCP client's `maxTotalTimeout` setting (if available)
3. The server sends progress notifications which can reset timeouts if `resetTimeoutOnProgress` is enabled in your client

### Progress Notifications

The server sends progress notifications during extraction:

- `Order X/Y (order-id) - ETA: ~Xm Xs`

These help track progress and can reset client timeouts if configured.

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

### Testing with MCP Inspector

For development and debugging, use the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector) tool instead of running through an AI assistant. This provides:

- **Direct tool invocation** - Call MCP tools directly with custom parameters
- **Real-time response viewing** - See full JSON responses without AI interpretation
- **Faster iteration** - No waiting for AI to process requests
- **Debug visibility** - View raw server output and errors

#### Quick Start

```bash
# Install MCP Inspector globally
npm install -g @modelcontextprotocol/inspector

# Run inspector with this server
npx @modelcontextprotocol/inspector node dist/index.js
```

Then open `http://localhost:5173` in your browser to:

1. See all available tools listed
2. Click a tool to view its schema
3. Fill in parameters and execute
4. View the raw JSON response

#### Example Test Workflow

1. **Test authentication**: Call `check_amazon_auth_status` with `{"region": "uk"}`
2. **Test order fetch**: Call `get_amazon_orders` with a small date range
3. **Test order details**: Call `get_amazon_order_details` with a known order ID
4. **Test exports**: Call any `export_amazon_*_csv` tool

This is the recommended approach for:

- Debugging extraction issues
- Verifying new features work correctly
- Testing region-specific behavior
- Investigating error responses

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
