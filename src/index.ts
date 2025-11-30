#!/usr/bin/env node

/**
 * Amazon Order History CSV Download MCP Server
 *
 * MCP server for extracting Amazon order history and exporting to CSV.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { AmazonPlugin } from './amazon/adapter';
import { getRegionCodes } from './amazon/regions';

// Initialize the Amazon plugin
const amazonPlugin = new AmazonPlugin();

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'get_amazon_orders',
    description: 'Fetch Amazon order history for a specified date range or year',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: `Amazon region code: ${getRegionCodes().join(', ')}`,
          enum: getRegionCodes(),
        },
        year: {
          type: 'number',
          description: 'Year to fetch orders from (e.g., 2024)',
        },
        start_date: {
          type: 'string',
          description: 'Start date in ISO format (YYYY-MM-DD)',
        },
        end_date: {
          type: 'string',
          description: 'End date in ISO format (YYYY-MM-DD)',
        },
        include_items: {
          type: 'boolean',
          description: 'Include item details for each order',
          default: false,
        },
        include_shipments: {
          type: 'boolean',
          description: 'Include shipment tracking info',
          default: false,
        },
      },
      required: ['region'],
    },
  },
  {
    name: 'get_amazon_order_details',
    description: 'Get detailed information for a specific Amazon order',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'Amazon order ID (e.g., 123-4567890-1234567)',
        },
        region: {
          type: 'string',
          description: 'Amazon region code',
          enum: getRegionCodes(),
        },
      },
      required: ['order_id', 'region'],
    },
  },
  {
    name: 'export_amazon_orders_csv',
    description: 'Export Amazon orders summary to CSV file',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Amazon region code',
          enum: getRegionCodes(),
        },
        year: {
          type: 'number',
          description: 'Year to export',
        },
        output_path: {
          type: 'string',
          description: 'Path to save the CSV file',
        },
      },
      required: ['region', 'output_path'],
    },
  },
  {
    name: 'export_amazon_items_csv',
    description: 'Export Amazon order items to CSV file',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Amazon region code',
          enum: getRegionCodes(),
        },
        year: {
          type: 'number',
          description: 'Year to export',
        },
        output_path: {
          type: 'string',
          description: 'Path to save the CSV file',
        },
      },
      required: ['region', 'output_path'],
    },
  },
  {
    name: 'export_amazon_shipments_csv',
    description: 'Export Amazon shipment tracking to CSV file',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Amazon region code',
          enum: getRegionCodes(),
        },
        year: {
          type: 'number',
          description: 'Year to export',
        },
        output_path: {
          type: 'string',
          description: 'Path to save the CSV file',
        },
      },
      required: ['region', 'output_path'],
    },
  },
  {
    name: 'export_amazon_transactions_csv',
    description: 'Export Amazon payment transactions to CSV file',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Amazon region code',
          enum: getRegionCodes(),
        },
        year: {
          type: 'number',
          description: 'Year to export',
        },
        output_path: {
          type: 'string',
          description: 'Path to save the CSV file',
        },
      },
      required: ['region', 'output_path'],
    },
  },
  {
    name: 'check_amazon_auth_status',
    description: 'Check if browser session is authenticated with Amazon',
    inputSchema: {
      type: 'object',
      properties: {
        region: {
          type: 'string',
          description: 'Amazon region code',
          enum: getRegionCodes(),
        },
      },
      required: ['region'],
    },
  },
];

// Create server instance
const server = new Server(
  {
    name: 'amazon-order-history-csv-download-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_amazon_orders':
        // TODO: Implement order fetching
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'not_implemented',
                message: 'Order fetching not yet implemented',
                params: args,
              }),
            },
          ],
        };

      case 'get_amazon_order_details':
        // TODO: Implement order details
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'not_implemented',
                message: 'Order details not yet implemented',
                params: args,
              }),
            },
          ],
        };

      case 'export_amazon_orders_csv':
      case 'export_amazon_items_csv':
      case 'export_amazon_shipments_csv':
      case 'export_amazon_transactions_csv':
        // TODO: Implement CSV export
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'not_implemented',
                message: 'CSV export not yet implemented',
                tool: name,
                params: args,
              }),
            },
          ],
        };

      case 'check_amazon_auth_status':
        // TODO: Implement auth check with Playwright
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'not_implemented',
                message: 'Auth check not yet implemented',
                params: args,
              }),
            },
          ],
        };

      default:
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: String(error),
          }),
        },
      ],
      isError: true,
    };
  }
});

// Main entry point
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Amazon Order History CSV Download MCP server running');
}

main().catch(console.error);
