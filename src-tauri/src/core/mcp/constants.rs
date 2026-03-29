// Default MCP runtime settings
pub const DEFAULT_MCP_TOOL_CALL_TIMEOUT_SECS: u64 = 90;
pub const DEFAULT_MCP_BASE_RESTART_DELAY_MS: u64 = 1000; // Start with 1 second
pub const DEFAULT_MCP_MAX_RESTART_DELAY_MS: u64 = 30000; // Cap at 30 seconds
pub const DEFAULT_MCP_BACKOFF_MULTIPLIER: f64 = 2.0; // Double the delay each time

pub fn local_browser_mcp_config(active: bool, official: bool) -> serde_json::Value {
    let mut env = serde_json::Map::from_iter([
        (
            "PLAYWRIGHT_MCP_USER_DATA_DIR".to_string(),
            serde_json::json!("$APP_DATA_DIR/playwright-profile"),
        ),
        (
            "PLAYWRIGHT_MCP_OUTPUT_DIR".to_string(),
            serde_json::json!("$APP_DATA_DIR/playwright-output"),
        ),
    ]);

    if cfg!(target_os = "macos") {
        env.insert(
            "PLAYWRIGHT_MCP_BROWSER".to_string(),
            serde_json::json!("chrome"),
        );
    }

    serde_json::json!({
        "command": "npx",
        "args": ["-y", "@playwright/mcp@0.0.68"],
        "env": env,
        "active": active,
        "official": official
    })
}

pub fn default_mcp_config() -> String {
    serde_json::json!({
      "mcpServers": {
        "Jan Browser MCP": {
          "command": "npx",
          "args": ["-y", "search-mcp-server@latest"],
          "env": {
            "BRIDGE_HOST": "127.0.0.1",
            "BRIDGE_PORT": "17389"
          },
          "active": false,
          "official": true
        },
        "Local Browser MCP": local_browser_mcp_config(false, true),
        "exa": {
          "type": "http",
          "url": "https://mcp.exa.ai/mcp",
          "command": "",
          "args": [],
          "env": {},
          "active": true
        },
        "browsermcp": {
          "command": "npx",
          "args": ["@browsermcp/mcp"],
          "env": {},
          "active": false
        },
        "fetch": {
          "command": "uvx",
          "args": ["mcp-server-fetch"],
          "env": {},
          "active": false
        },
        "serper": {
          "command": "npx",
          "args": ["-y", "serper-search-scrape-mcp-server"],
          "env": { "SERPER_API_KEY": "YOUR_SERPER_API_KEY_HERE" },
          "active": false
        },
        "filesystem": {
          "command": "npx",
          "args": [
            "-y",
            "@modelcontextprotocol/server-filesystem",
            "/path/to/other/allowed/dir"
          ],
          "env": {},
          "active": false
        },
        "sequential-thinking": {
          "command": "npx",
          "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"],
          "env": {},
          "active": false
        }
      },
      "mcpSettings": {
        "toolCallTimeoutSeconds": DEFAULT_MCP_TOOL_CALL_TIMEOUT_SECS,
        "baseRestartDelayMs": DEFAULT_MCP_BASE_RESTART_DELAY_MS,
        "maxRestartDelayMs": DEFAULT_MCP_MAX_RESTART_DELAY_MS,
        "backoffMultiplier": DEFAULT_MCP_BACKOFF_MULTIPLIER
      }
    })
    .to_string()
}
