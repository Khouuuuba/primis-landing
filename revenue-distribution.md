# Primis Revenue Distribution Model

## Overview

Primis takes **10% fee** on all compute volume processed through the network. This revenue is split **50/50** between stakers and the protocol. Your APY is **variable** based on your share of the Total Value Locked (TVL).

**Key Insight**: Early stakers benefit massively. As more people stake, APY decreases proportionally.

---

## Revenue Formula

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPUTE VOLUME                            │
│              (AI builders paying for GPU compute)            │
│                     Yearly: $10,000,000                      │
└─────────────────────────────────────────────────────────────┘
                              │
                        10% Fee
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PRIMIS REVENUE                            │
│                        $1,000,000/year                       │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
        ┌──────────┐                    ┌──────────┐
        │   50%    │                    │   50%    │
        │ STAKERS  │                    │  PRIMIS  │
        │ $500K/yr │                    │ $500K/yr │
        └──────────┘                    └──────────┘
              │                               │
              ▼                               ▼
        Your share =                   Protocol
        (Your Stake / TVL)             treasury
        × $500K                        & operations
```

---

## Variable APY Explained

Your APY depends on:
1. **Your stake amount** (in SOL)
2. **Total Value Locked** (TVL)
3. **Yearly staker pool** ($500K from $10M compute volume)

### Formula
```
Your Yearly Earnings = (Your Stake / TVL) × Staker Pool

Your APY = (Your Yearly Earnings / Your Stake Value) × 100
```

### Examples

| Your Stake | TVL | Your % of TVL | Yearly Earnings | Your APY |
|------------|-----|---------------|-----------------|----------|
| 10 SOL | 11 SOL | 90.9% | $454,545 | **30,303%** |
| 100 SOL | 1,000 SOL | 10% | $50,000 | **333%** |
| 1,000 SOL | 10,000 SOL | 10% | $50,000 | **33%** |
| 1,000 SOL | 100,000 SOL | 1% | $5,000 | **3.3%** |
| 10,000 SOL | 1,000,000 SOL | 1% | $5,000 | **0.33%** |

**Key Takeaway**: 
- **Low TVL = High APY** (early stakers benefit)
- **High TVL = Lower APY** (but more sustainable)

---

## Revenue Streams

### Compute Volume Sources
- **GPU Instances**: RunPod, Vast.ai, Lambda Labs rentals
- **Serverless Inference**: SDXL, Llama, Whisper endpoints
- **Batch Processing**: Large-scale AI job queues
- **Model Deployments**: Custom model hosting

### Current Simulation (Devnet)
| Metric | Value |
|--------|-------|
| Simulated Yearly Compute | $10,000,000 |
| Primis Fee (10%) | $1,000,000 |
| Staker Pool (50%) | $500,000 |
| Distribution Interval | Every 10 minutes |
| Per-interval Distribution | ~$9.51 = ~0.063 SOL |

---

## Comparison to Alternatives

| Platform | APY | Model | Variable? |
|----------|-----|-------|-----------|
| Native Solana | 6.33% | Validator rewards | No |
| Marinade (mSOL) | 6.5% | Liquid staking | No |
| Jito (jitoSOL) | 7.0% | MEV rewards | Slightly |
| **Primis (Low TVL)** | **100%+** | Compute revenue share | **Yes** |
| **Primis (High TVL)** | **~10%** | Compute revenue share | **Yes** |

**Why Variable?** Fixed staker pool divided among all stakers. Fewer stakers = higher per-staker earnings.

---

## On-Chain Implementation

### Vault Account Structure
```rust
pub struct Vault {
    pub authority: Pubkey,           // Admin authority
    pub total_staked: u64,           // Total SOL staked (lamports)
    pub staker_count: u32,           // Number of unique stakers
    pub total_yield_distributed: u64, // Cumulative yield (lamports)
    pub last_distribution: i64,      // Unix timestamp
}
```

### Distribution Flow (New Model)
```
1. Scheduler triggers distribution (every 10 min)
2. Calculate interval revenue:
   - computeVolume = $10M / 52,560 intervals
   - revenue = computeVolume × 10%
   - stakerShare = revenue × 50%
   - primisShare = revenue × 50%
3. Convert stakerShare to SOL
4. Fund vault with stakerShare
5. Call distributeYield on-chain
6. Pro-rata distribute to all stake accounts
7. Emit DistributionEvent for indexing
```

---

## API Endpoints

### GET /api/yield/revenue-model
Returns the revenue model configuration.
```json
{
  "success": true,
  "model": {
    "yearlyComputeVolumeUSD": 10000000,
    "yearlyRevenueUSD": 1000000,
    "yearlyStakerPoolUSD": 500000,
    "primisFeePercent": 10,
    "stakerSharePercent": 50,
    "primisSharePercent": 50,
    "solPriceUSD": 150,
    "yearlyStakerPoolSOL": 3333.33,
    "perIntervalStakerPoolUSD": 9.51,
    "perIntervalStakerPoolSOL": 0.0634,
    "intervalsPerYear": 52560,
    "description": "Primis takes 10% fee on compute volume. Revenue is split 50/50 with stakers."
  }
}
```

### GET /api/yield/apy/:stakeSOL
Calculate variable APY for a given stake amount.
```json
{
  "success": true,
  "apy": {
    "userStakeSOL": 10,
    "totalStakedSOL": 11.31,
    "stakePercent": "88.42",
    "yearlyEarningsUSD": "442086.65",
    "yearlyEarningsSOL": "2947.24",
    "effectiveAPY": "29472.44",
    "revenueModel": {...}
  }
}
```

### GET /api/yield/my-apy/:wallet
Calculate variable APY for a specific wallet's stake.

### GET /api/stats
Returns current protocol statistics.
```json
{
  "totalStakedSol": 11.31,
  "totalStakers": 1,
  "totalJobsCompleted": 11,
  "networkRevenueSol": 0.121453138,
  "distributionCount": 30,
  "updatedAt": "2026-01-26T12:20:04.608Z"
}
```

---

## Database Schema

### yield_distributions
```sql
CREATE TABLE yield_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_yield_lamports BIGINT NOT NULL,     -- Total revenue (100%)
  staker_share_lamports BIGINT NOT NULL,    -- 50% to stakers
  subsidy_share_lamports BIGINT NOT NULL,   -- Deprecated (0)
  reserve_share_lamports BIGINT NOT NULL,   -- 50% to Primis
  total_staked_lamports BIGINT NOT NULL,
  staker_count INTEGER NOT NULL,
  source VARCHAR(50) DEFAULT 'automated',
  tx_signature VARCHAR(100),
  distributed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Yield Simulator (Devnet)

### Configuration
```javascript
// New Revenue Model Parameters
const SIMULATED_YEARLY_COMPUTE_VOLUME_USD = 10_000_000; // $10M yearly
const PRIMIS_FEE_PERCENT = 0.10; // 10% fee on compute
const STAKER_SHARE_PERCENT = 0.50; // 50% of revenue to stakers
const PRIMIS_SHARE_PERCENT = 0.50; // 50% of revenue to Primis

// Calculated values
const YEARLY_REVENUE_USD = 1_000_000; // $1M
const YEARLY_STAKER_POOL_USD = 500_000; // $500K
const INTERVALS_PER_YEAR = 52_560; // Every 10 minutes
const PER_INTERVAL_STAKER_POOL = 9.51; // ~$9.51 per interval
```

### Running the Simulator
```bash
cd backend

# Setup (one-time): Generate authority keypair
npm run yield:setup

# Start simulator (runs every 10 minutes)
npm run yield:start

# Run single distribution immediately
npm run yield:now
```

---

## Economic Sustainability

### Scaling Economics

As TVL grows, APY naturally decreases to sustainable levels:

| TVL | Yearly Staker Pool | Effective APY |
|-----|-------------------|---------------|
| $10K (66 SOL) | $500K | 5,000% |
| $100K (666 SOL) | $500K | 500% |
| $1M (6,666 SOL) | $500K | 50% |
| $10M (66,666 SOL) | $500K | 5% |
| $100M (666,666 SOL) | $500K | 0.5% |

**Note**: In production, compute volume would scale with TVL, potentially maintaining higher APYs. The $10M simulation is conservative.

### Why This Model Works

1. **Early Staker Incentive**: High APY attracts early capital
2. **Natural Equilibrium**: APY stabilizes as TVL grows
3. **Real Revenue**: Based on actual compute usage, not inflation
4. **Sustainable**: No token minting or unsustainable yields

---

## Future Enhancements

### Phase 1: Current (Devnet) ✅
- [x] Variable APY based on stake %
- [x] 10% fee / 50-50 split model
- [x] Real-time APY calculation API
- [x] Frontend variable APY display
- [x] 10-minute distribution intervals

### Phase 2: Mainnet Launch
- [ ] Real compute volume from AI builders
- [ ] Dynamic fee adjustment (5-15% based on market)
- [ ] Auto-compound option
- [ ] Multiple asset support (USDC staking)

### Phase 3: Advanced Features
- [ ] Tiered fee structure (volume discounts)
- [ ] LST support (mSOL, jitoSOL as collateral)
- [ ] Governance over fee parameters
- [ ] Revenue share with GPU providers

---

## Summary

| Parameter | Value |
|-----------|-------|
| Compute Fee | 10% |
| Staker Share | 50% |
| Primis Share | 50% |
| APY Type | **Variable** |
| Early Staker APY | Very High (1000%+) |
| Mature TVL APY | Moderate (5-10%) |
| Distribution Frequency | Every 10 minutes |

**Formula**: `Your APY = ($500K × Your Stake %) / Your Stake Value`

---

*Last updated: January 26, 2026 - Sprint 5.10: Variable APY Revenue Model*
