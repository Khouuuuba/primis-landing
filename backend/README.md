# Primis Backend API

Express.js backend for Primis Protocol.

## Quick Start

### 1. Set up PostgreSQL Database

Get a free PostgreSQL database from one of these providers:

**Supabase (Recommended for starters)**
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings > Database > Connection string
4. Copy the connection string (starts with `postgresql://...`)

**Or Railway**
1. Go to [railway.app](https://railway.app)
2. Create a new project > Add PostgreSQL
3. Copy the connection string from the Variables tab

### 2. Configure Environment

```bash
# Copy the example env file
cp env.example.txt .env

# Edit .env and add your DATABASE_URL
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Initialize Database

```bash
npm run db:init
```

This creates all tables and views defined in `src/db/schema.sql`.

### 5. Start the Server

```bash
npm run dev
```

Server runs at `http://localhost:3001`

## API Endpoints

### Health & Stats
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check with DB status |
| GET | `/api/stats` | Protocol statistics |

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/verify` | Register/verify Privy user |
| GET | `/api/auth/me` | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/profile` | Get user profile + portfolio |
| PATCH | `/api/users/profile` | Update user profile |

### Stakes (Capital Providers)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stakes/position` | Get staking position |
| POST | `/api/stakes` | Create new stake |
| POST | `/api/stakes/:id/unstake` | Request withdrawal |
| GET | `/api/stakes/earnings/history` | Earnings history |
| GET | `/api/stakes/yield-rates` | Current APY rates |

### Jobs (AI Builders)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs/instances` | Available GPU types |
| GET | `/api/jobs` | List user's jobs |
| GET | `/api/jobs/:id` | Get job details |
| POST | `/api/jobs` | Create new job |
| DELETE | `/api/jobs/:id` | Terminate job |
| GET | `/api/jobs/credits/balance` | Credit balance |
| GET | `/api/jobs/credits/history` | Credit history |

## Authentication

All authenticated routes require the `x-privy-id` header:

```bash
curl -H "x-privy-id: did:privy:xxx" http://localhost:3001/api/users/profile
```

## Database Schema

See `src/db/schema.sql` for the full schema. Key tables:

- `users` - User accounts (Privy-linked)
- `stakes` - SOL staking positions
- `earnings` - Yield + compute revenue
- `credits` - AI Builder credit balances
- `jobs` - Compute jobs
- `protocol_stats` - Aggregate metrics

## Development

```bash
# Run in development (auto-reload)
npm run dev

# Run in production
npm start
```
