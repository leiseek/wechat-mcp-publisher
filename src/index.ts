#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { Article, createAccountManager } from "./wechat-api.js";

const manager = createAccountManager();

if (manager.size === 0) {
  console.error("Error: No WeChat accounts configured.");
  console.error("Set WECHAT_ACCOUNTS env var as JSON, or WECHAT_APP_ID+WECHAT_APP_SECRET, or fill config.json");
  process.exit(1);
}

console.error(`Loaded ${manager.size} account(s): ${manager.listAccountIds().join(', ')}`);

const server = new Server(
  {
    name: "wechat-mp-publisher",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_accounts",
        description: "列出所有已配置的公众号账号",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_access_token",
        description: "获取指定公众号的access_token",
        inputSchema: {
          type: "object",
          properties: {
            account_id: {
              type: "string",
              description: "公众号账号标识，不传则使用默认账号",
            },
          },
        },
      },
      {
        name: "add_draft",
        description: "添加文章到指定公众号的草稿箱",
        inputSchema: {
          type: "object",
          properties: {
            account_id: {
              type: "string",
              description: "公众号账号标识，不传则使用默认账号",
            },
            title: {
              type: "string",
              description: "文章标题",
            },
            author: {
              type: "string",
              description: "作者",
            },
            content: {
              type: "string",
              description: "文章内容（HTML格式）",
            },
            digest: {
              type: "string",
              description: "摘要",
            },
            thumb_media_id: {
              type: "string",
              description: "封面图片的media_id",
            },
          },
          required: ["title", "content", "thumb_media_id"],
        },
      },
      {
        name: "publish",
        description: "发布指定公众号的草稿文章",
        inputSchema: {
          type: "object",
          properties: {
            account_id: {
              type: "string",
              description: "公众号账号标识，不传则使用默认账号",
            },
            media_id: {
              type: "string",
              description: "草稿的media_id",
            },
          },
          required: ["media_id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_accounts": {
        const ids = manager.listAccountIds();
        const list = ids.map(id => {
          const info = manager.getAccountInfo(id);
          return { account_id: id, app_id: info?.appId || '' };
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ accounts: list, total: list.length }, null, 2),
            },
          ],
        };
      }

      case "get_access_token": {
        const accountId = args?.account_id as string | undefined;
        const client = manager.getClient(accountId);
        const token = await client.getAccessToken();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ account_id: client.accountId, access_token: token }, null, 2),
            },
          ],
        };
      }

      case "add_draft": {
        const accountId = args?.account_id as string | undefined;
        const client = manager.getClient(accountId);
        const article: Article = {
          title: args.title as string,
          author: args.author as string | undefined,
          content: args.content as string,
          digest: args.digest as string | undefined,
          thumb_media_id: args.thumb_media_id as string,
        };

        const result = await client.addDraft([article]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ account_id: client.accountId, ...result }, null, 2),
            },
          ],
        };
      }

      case "publish": {
        const accountId = args?.account_id as string | undefined;
        const client = manager.getClient(accountId);
        const mediaId = args.media_id as string;
        const result = await client.publish(mediaId);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ account_id: client.accountId, ...result }, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`WeChat MP MCP Server running on stdio with ${manager.size} account(s)`);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
