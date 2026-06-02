//! Spec 040 v0.2 — Atlas web tools platform extension.
//!
//! Registers three tools that the agent can call:
//!   - `web_search`  : keyword query → list of {title, url, snippet}
//!   - `web_scrape`  : URL → markdown of page
//!   - `read_url`    : alias for web_scrape (so the agent reaches for it
//!                     more naturally on user prompts like "summarize X")
//!
//! Each tool POSTs to `${ATLAS_AUTH_BACKEND_URL}/v1/tools/web/{search|scrape}`
//! with the user's access token in the `Authorization` header. The proxy
//! enforces per-tier quota + per-org budget (Constitution Principle V)
//! before any upstream call to Brave / Tavily / Serper / Firecrawl.
//!
//! Bearer token is read from env (`ATLAS_ACCESS_TOKEN`) which the desktop
//! sets at goosed-spawn time. Token rotates every 15 min — when expired,
//! the proxy returns 401 and the tool surfaces an error; the desktop is
//! expected to refresh and respawn (v0.2.1 will add live token push).

use crate::agents::extension::PlatformExtensionContext;
use crate::agents::mcp_client::{Error, McpClientTrait};
use crate::agents::tool_execution::ToolCallContext;
use anyhow::Result;
use async_trait::async_trait;
use indoc::indoc;
use reqwest::Client;
use rmcp::model::{
    CallToolResult, Content, Implementation, InitializeResult, JsonObject, ListToolsResult,
    ServerCapabilities, Tool, ToolAnnotations,
};
use schemars::{schema_for, JsonSchema};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

pub static EXTENSION_NAME: &str = "atlas_web";

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
struct WebSearchParams {
    /// What to search the web for.
    query: String,
    /// Max results to return (1-20, default 10).
    #[serde(default)]
    count: Option<u32>,
    /// Optional provider slug (admin-configured: brave|tavily|serper|...).
    /// Defaults to "brave".
    #[serde(default)]
    provider: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, JsonSchema)]
struct WebScrapeParams {
    /// Absolute http(s) URL to fetch + extract main content from.
    url: String,
    /// Optional provider slug (admin-configured). Defaults to "firecrawl".
    #[serde(default)]
    provider: Option<String>,
}

pub struct AtlasWebClient {
    info: InitializeResult,
    #[allow(dead_code)]
    context: PlatformExtensionContext,
    http: Client,
}

impl AtlasWebClient {
    pub fn new(context: PlatformExtensionContext) -> Result<Self> {
        let info = InitializeResult::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(
                Implementation::new(EXTENSION_NAME.to_string(), "0.2.0".to_string())
                    .with_title("Atlas Web Tools"),
            )
            .with_instructions(
                indoc! {r#"
                Use web tools ONLY when:
                - the user asks for current / recent information not in the model's training set
                - the user provides a URL to read, summarize, or extract from
                - the user explicitly asks to search the web or cite sources

                DO NOT search for general knowledge already in the model's training set.
                DO NOT search for code/syntax questions, math, or definitions unless asked.

                Tools:
                - web_search(query, count?, provider?)  — keyword search
                - web_scrape(url, provider?)            — fetch + extract page content as markdown
                - read_url(url, provider?)              — alias for web_scrape
                "#}
                .to_string(),
            );

        let http = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| anyhow::anyhow!("http client init: {e}"))?;
        Ok(Self { info, context, http })
    }

    fn backend_url() -> Option<String> {
        std::env::var("ATLAS_AUTH_BACKEND_URL").ok()
    }

    fn access_token() -> Option<String> {
        std::env::var("ATLAS_ACCESS_TOKEN").ok()
    }

    async fn do_search(&self, params: WebSearchParams) -> Result<Vec<Content>, String> {
        let backend = Self::backend_url()
            .ok_or_else(|| "ATLAS_AUTH_BACKEND_URL not set — sign in to Atlas".to_string())?;
        let token = Self::access_token()
            .ok_or_else(|| "Not signed in to Atlas — sign-in required for web tools".to_string())?;
        let body = serde_json::json!({
            "query": params.query,
            "count": params.count.unwrap_or(10),
            "provider": params.provider.unwrap_or_else(|| "brave".to_string()),
        });
        let res = self
            .http
            .post(format!("{}/v1/tools/web/search", backend.trim_end_matches('/')))
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!("atlas /v1/tools/web/search {status}: {}",
                text.chars().take(400).collect::<String>()));
        }
        Ok(vec![Content::text(text)])
    }

    async fn do_scrape(&self, params: WebScrapeParams) -> Result<Vec<Content>, String> {
        let backend = Self::backend_url()
            .ok_or_else(|| "ATLAS_AUTH_BACKEND_URL not set — sign in to Atlas".to_string())?;
        let token = Self::access_token()
            .ok_or_else(|| "Not signed in to Atlas — sign-in required for web tools".to_string())?;
        let body = serde_json::json!({
            "url": params.url,
            "provider": params.provider.unwrap_or_else(|| "firecrawl".to_string()),
        });
        let res = self
            .http
            .post(format!("{}/v1/tools/web/scrape", backend.trim_end_matches('/')))
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!("atlas /v1/tools/web/scrape {status}: {}",
                text.chars().take(400).collect::<String>()));
        }
        Ok(vec![Content::text(text)])
    }

    fn get_tools() -> Vec<Tool> {
        let search_schema = serde_json::to_value(schema_for!(WebSearchParams))
            .expect("WebSearchParams schema");
        let scrape_schema = serde_json::to_value(schema_for!(WebScrapeParams))
            .expect("WebScrapeParams schema");
        vec![
            Tool::new(
                "web_search".to_string(),
                "Search the web for current information. Returns a list of {title, url, snippet}. Use sparingly — only when the model's knowledge can't answer."
                    .to_string(),
                search_schema.as_object().unwrap().clone(),
            )
            .annotate(ToolAnnotations::from_raw(
                Some("Web search".to_string()),
                Some(true), Some(false), Some(false), Some(true),
            )),
            Tool::new(
                "web_scrape".to_string(),
                "Fetch the given URL and extract main content as markdown. Use for: 'summarize this page', 'extract data from X', 'what does Y say about Z'."
                    .to_string(),
                scrape_schema.as_object().unwrap().clone(),
            )
            .annotate(ToolAnnotations::from_raw(
                Some("Web scrape".to_string()),
                Some(true), Some(false), Some(false), Some(true),
            )),
            Tool::new(
                "read_url".to_string(),
                "Alias for web_scrape — fetch a URL and read its main content."
                    .to_string(),
                scrape_schema.as_object().unwrap().clone(),
            )
            .annotate(ToolAnnotations::from_raw(
                Some("Read URL".to_string()),
                Some(true), Some(false), Some(false), Some(true),
            )),
        ]
    }
}

#[async_trait]
impl McpClientTrait for AtlasWebClient {
    async fn list_tools(
        &self,
        _session_id: &str,
        _next_cursor: Option<String>,
        _cancellation_token: CancellationToken,
    ) -> Result<ListToolsResult, Error> {
        Ok(ListToolsResult {
            tools: Self::get_tools(),
            next_cursor: None,
            meta: None,
        })
    }

    async fn call_tool(
        &self,
        _ctx: &ToolCallContext,
        name: &str,
        arguments: Option<JsonObject>,
        _cancellation_token: CancellationToken,
    ) -> Result<CallToolResult, Error> {
        let result = match name {
            "web_search" => {
                let args = arguments.unwrap_or_default();
                match serde_json::from_value::<WebSearchParams>(serde_json::Value::Object(args)) {
                    Ok(p) => self.do_search(p).await,
                    Err(e) => Err(format!("invalid web_search params: {e}")),
                }
            }
            "web_scrape" | "read_url" => {
                let args = arguments.unwrap_or_default();
                match serde_json::from_value::<WebScrapeParams>(serde_json::Value::Object(args)) {
                    Ok(p) => self.do_scrape(p).await,
                    Err(e) => Err(format!("invalid {} params: {e}", name)),
                }
            }
            _ => Err(format!("Unknown tool: {name}")),
        };
        match result {
            Ok(content) => Ok(CallToolResult::success(content)),
            Err(error) => Ok(CallToolResult::error(vec![Content::text(format!(
                "Error: {error}"
            ))])),
        }
    }

    fn get_info(&self) -> Option<&InitializeResult> {
        Some(&self.info)
    }
}
