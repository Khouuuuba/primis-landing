# Moltbot on Primis - Railway Template

Deploy Moltbot to Railway in one click.

## Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/moltbot-primis)

## Manual Deployment

1. Fork this template
2. Connect to Railway
3. Set environment variables:
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
   - `TELEGRAM_BOT_TOKEN` (optional)
   - `DISCORD_BOT_TOKEN` (optional)
4. Deploy!

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Claude API key |
| `OPENAI_API_KEY` | Yes* | OpenAI API key |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token |
| `DISCORD_BOT_TOKEN` | No | Discord bot token |

*At least one AI provider key is required.

## Resources

- **RAM**: 2GB (recommended)
- **CPU**: 2 vCPU (shared)
- **Storage**: Volume for /data

## Support

- [Moltbot Docs](https://docs.molt.bot)
- [Primis Discord](https://discord.gg/primis)
