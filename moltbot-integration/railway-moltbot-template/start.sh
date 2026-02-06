#!/bin/bash
# ==============================================================================
# Moltbot Startup Script
# ==============================================================================
# This script validates environment variables and starts the Moltbot gateway.
# Exit codes:
#   0 - Success
#   1 - Missing required environment variable
#   2 - Moltbot failed to start
# ==============================================================================

set -e

echo "=================================================="
echo "  Moltbot on Primis"
echo "  Starting gateway..."
echo "=================================================="
echo ""

# ==============================================================================
# Validate Environment Variables
# ==============================================================================

validate_env() {
    local var_name=$1
    local var_value=${!var_name}
    
    if [ -z "$var_value" ]; then
        return 1
    fi
    return 0
}

mask_secret() {
    local secret=$1
    if [ ${#secret} -lt 12 ]; then
        echo "***"
    else
        echo "${secret:0:4}...${secret: -4}"
    fi
}

# Check for AI provider key (at least one required)
HAS_AI_KEY=false

if validate_env "ANTHROPIC_API_KEY"; then
    echo "✓ Anthropic API key configured: $(mask_secret "$ANTHROPIC_API_KEY")"
    HAS_AI_KEY=true
fi

if validate_env "OPENAI_API_KEY"; then
    echo "✓ OpenAI API key configured: $(mask_secret "$OPENAI_API_KEY")"
    HAS_AI_KEY=true
fi

if [ "$HAS_AI_KEY" = false ]; then
    echo ""
    echo "❌ ERROR: No AI provider configured!"
    echo "   Set either ANTHROPIC_API_KEY or OPENAI_API_KEY"
    echo ""
    exit 1
fi

# Check for channel tokens (at least one recommended)
HAS_CHANNEL=false

if validate_env "TELEGRAM_BOT_TOKEN"; then
    echo "✓ Telegram configured: $(mask_secret "$TELEGRAM_BOT_TOKEN")"
    HAS_CHANNEL=true
fi

if validate_env "DISCORD_BOT_TOKEN"; then
    echo "✓ Discord configured: $(mask_secret "$DISCORD_BOT_TOKEN")"
    HAS_CHANNEL=true
fi

if validate_env "SLACK_BOT_TOKEN"; then
    echo "✓ Slack configured: $(mask_secret "$SLACK_BOT_TOKEN")"
    HAS_CHANNEL=true
fi

if [ "$HAS_CHANNEL" = false ]; then
    echo ""
    echo "⚠️  WARNING: No chat channels configured!"
    echo "   Set TELEGRAM_BOT_TOKEN or DISCORD_BOT_TOKEN for chat functionality"
    echo "   (Gateway will still start for API-only usage)"
    echo ""
fi

# ==============================================================================
# Show Configuration
# ==============================================================================

echo ""
echo "Configuration:"
echo "  PORT: ${PORT:-3000}"
echo "  STATE_DIR: ${CLAWDBOT_STATE_DIR:-/data}"
echo "  NODE_OPTIONS: ${NODE_OPTIONS:-(default)}"
echo ""

# ==============================================================================
# Start Moltbot Gateway
# ==============================================================================

echo "Starting Moltbot gateway..."
echo ""

# Generate a gateway token if not provided
export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-$(cat /proc/sys/kernel/random/uuid 2>/dev/null || echo 'primis-gateway-token')}"
echo "  GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN:0:8}..."

# Initialize OpenClaw config
echo ""
echo "Initializing OpenClaw configuration..."

# Set BOTH state dir variables explicitly - OpenClaw checks both
export OPENCLAW_STATE_DIR="/data"
export CLAWDBOT_STATE_DIR="/data"

# CRITICAL: Set explicit config path - this is the most reliable method
export OPENCLAW_CONFIG_PATH="/data/openclaw.json"

echo "  OPENCLAW_STATE_DIR: $OPENCLAW_STATE_DIR"
echo "  OPENCLAW_CONFIG_PATH: $OPENCLAW_CONFIG_PATH"

# Create config directory
mkdir -p /data

# Create the OpenClaw config file
# Bot token is read from TELEGRAM_BOT_TOKEN env var automatically
# dmPolicy and allowFrom control access
#
# IMPORTANT: agents.defaults.model.primary overrides the framework default
# (claude-opus-4-6) which has a 30k input tokens/min rate limit.
# claude-sonnet-4-5 has 80k tokens/min and avoids 429 rate_limit_error.
cat > /data/openclaw.json << 'CONFIGEOF'
{
  "gateway": {
    "mode": "local"
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-sonnet-4-5"
      }
    }
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "open",
      "allowFrom": ["*"]
    }
  }
}
CONFIGEOF

echo "✓ Config written to /data/openclaw.json"
echo "Config contents:"
cat /data/openclaw.json
echo ""

# Log the model being used (for rate limit debugging)
echo "Model: anthropic/claude-sonnet-4-5 (overrides default opus to avoid 30k/min rate limit)"

# Verify config can be parsed (basic JSON check)
if node -e "JSON.parse(require('fs').readFileSync('/data/openclaw.json'))" 2>/dev/null; then
  echo "✓ Config JSON is valid"
else
  echo "❌ Config JSON is invalid!"
  exit 1
fi

# Double-check the env vars are exported
echo ""
echo "Environment check:"
echo "  OPENCLAW_STATE_DIR=$OPENCLAW_STATE_DIR"
echo "  OPENCLAW_CONFIG_PATH=$OPENCLAW_CONFIG_PATH"
echo "  TELEGRAM_BOT_TOKEN=$(echo $TELEGRAM_BOT_TOKEN | head -c 10)..."
echo ""

# Create required directories
mkdir -p /data/agents/main/sessions
mkdir -p /data/credentials
chmod 700 /data

# ==============================================================================
# Inject Skills/Knowledge into Workspace
# ==============================================================================
# If CLAWDBOT_SYSTEM_PROMPT is set, write it to USER.md in the workspace
# This gets included in the agent's context automatically
WORKSPACE_DIR="/data/agents/main"
mkdir -p "$WORKSPACE_DIR"

if [ -n "$CLAWDBOT_SYSTEM_PROMPT" ]; then
    echo "✓ Injecting custom knowledge/skills into workspace..."
    echo "$CLAWDBOT_SYSTEM_PROMPT" > "$WORKSPACE_DIR/USER.md"
    echo "  Written to: $WORKSPACE_DIR/USER.md"
    echo "  Content preview: $(echo "$CLAWDBOT_SYSTEM_PROMPT" | head -c 100)..."
else
    echo "  No custom skills/knowledge to inject"
fi

echo ""

# Run the gateway with proper signal handling
# Use "lan" to accept connections from Railway's load balancer
# Enable verbose logging to debug config loading issues
export OPENCLAW_VERBOSE=1

echo "Starting gateway with:"
echo "  Config: $OPENCLAW_CONFIG_PATH"
echo "  State: $OPENCLAW_STATE_DIR"
echo ""

exec node /app/dist/index.js gateway \
    --port "${PORT:-3000}" \
    --bind lan
