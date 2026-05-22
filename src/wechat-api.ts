const WECHAT_API_BASE = 'https://api.weixin.qq.com/cgi-bin';

export interface WeChatConfig {
  appId: string;
  appSecret: string;
}

export interface AccessToken {
  access_token: string;
  expires_in: number;
}

export interface Article {
  title: string;
  author?: string;
  digest?: string;
  content: string;
  content_source_url?: string;
  thumb_media_id: string;
  need_open_comment?: number;
  only_fans_can_comment?: number;
}

export interface AccountEntry {
  app_id: string;
  app_secret: string;
  auth_token?: string;
}

export interface AccountsConfig {
  [accountId: string]: AccountEntry;
}

export class WeChatMP {
  private appId: string;
  private appSecret: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  public readonly accountId: string;

  constructor(config: WeChatConfig & { accountId?: string }) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.accountId = config.accountId || 'default';
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;

    try {
      const response = await fetch(url);
      const data = await response.json() as AccessToken;

      if (data.access_token) {
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
        return this.accessToken;
      } else {
        throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      throw new Error(`Error fetching access token: ${error}`);
    }
  }

  async uploadImage(imagePath: string): Promise<string> {
    const token = await this.getAccessToken();
    const url = `${WECHAT_API_BASE}/material/add_material?access_token=${token}&type=image`;

    throw new Error('Image upload not implemented yet');
  }

  async addDraft(articles: Article[]): Promise<{ media_id: string }> {
    const token = await this.getAccessToken();
    const url = `${WECHAT_API_BASE}/draft/add?access_token=${token}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles })
      });

      const data = await response.json() as { media_id?: string; errcode?: number; errmsg?: string };

      if (data.media_id) {
        return { media_id: data.media_id };
      } else {
        throw new Error(`Failed to add draft: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      throw new Error(`Error adding draft: ${error}`);
    }
  }

  async publish(mediaId: string): Promise<{ publish_id: string; msg_data_id: string }> {
    const token = await this.getAccessToken();
    const url = `${WECHAT_API_BASE}/freepublish/submit?access_token=${token}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_id: mediaId })
      });

      const data = await response.json() as { publish_id?: string; msg_data_id?: string; errcode?: number; errmsg?: string };

      if (data.publish_id) {
        return {
          publish_id: data.publish_id,
          msg_data_id: data.msg_data_id || ''
        };
      } else {
        throw new Error(`Failed to publish: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      throw new Error(`Error publishing: ${error}`);
    }
  }
}

function loadAccountsFromEnv(): AccountsConfig | null {
  const raw = process.env.WECHAT_ACCOUNTS;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AccountsConfig;
  } catch {
    console.error('WECHAT_ACCOUNTS env var is not valid JSON, ignoring');
    return null;
  }
}

function loadAccountsFromFile(configPath?: string): AccountsConfig | null {
  try {
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const resolvedPath = configPath || path.resolve(process.cwd(), 'config.json');
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = JSON.parse(raw);

    if (parsed.accounts) {
      return parsed.accounts as AccountsConfig;
    }

    if (parsed.WECHAT_APP_ID) {
      return {
        default: {
          app_id: parsed.WECHAT_APP_ID,
          app_secret: parsed.WECHAT_APP_SECRET || '',
          auth_token: parsed.AUTH_TOKEN || ''
        }
      };
    }

    return null;
  } catch {
    return null;
  }
}

function loadAccountsFromLegacyEnv(): AccountsConfig | null {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (appId && appSecret) {
    return {
      default: {
        app_id: appId,
        app_secret: appSecret,
        auth_token: process.env.AUTH_TOKEN || ''
      }
    };
  }
  return null;
}

export function loadAccounts(configPath?: string): AccountsConfig {
  return loadAccountsFromEnv()
    || loadAccountsFromFile(configPath)
    || loadAccountsFromLegacyEnv()
    || {};
}

export class AccountManager {
  private clients: Map<string, WeChatMP> = new Map();
  private accounts: AccountsConfig;

  constructor(accounts?: AccountsConfig) {
    this.accounts = accounts || {};
    for (const [id, entry] of Object.entries(this.accounts)) {
      if (entry.app_id && entry.app_secret) {
        this.clients.set(id, new WeChatMP({
          appId: entry.app_id,
          appSecret: entry.app_secret,
          accountId: id,
        }));
      }
    }
  }

  getClient(accountId?: string): WeChatMP {
    const id = accountId || this.getPrimaryId();
    const client = this.clients.get(id);
    if (!client) {
      const available = this.listAccountIds().join(', ') || 'none';
      throw new Error(`Account '${id}' not found. Available accounts: ${available}`);
    }
    return client;
  }

  getPrimaryId(): string {
    return this.clients.size > 0 ? this.clients.keys().next().value : 'default';
  }

  listAccountIds(): string[] {
    return Array.from(this.clients.keys());
  }

  getAccountInfo(id: string): { appId: string } | null {
    const entry = this.accounts[id];
    if (!entry) return null;
    return { appId: entry.app_id };
  }

  get size(): number {
    return this.clients.size;
  }
}

export function createAccountManager(configPath?: string): AccountManager {
  const accounts = loadAccounts(configPath);
  return new AccountManager(accounts);
}
