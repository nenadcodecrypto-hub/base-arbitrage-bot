# Base Arbitrage Bot - Dual DEX Price Monitor

Monitor cbBTC/USDC prices on **Uniswap V3** and **Aerodrome Slipstream** on Base blockchain, tracking spreads for potential arbitrage opportunities.

## 🎯 Features

- **Real-time Monitoring**: Listens to Swap events on both DEXes
- **Automatic Token Detection**: Handles token0/token1 ordering automatically
- **High Precision**: Uses BigInt calculations for accurate pricing
- **Spread Calculation**: Shows price differences between DEXes
- **Live Updates**: Logs price changes with timestamps and transaction hashes
- **Dual DEX Support**: Monitors both Uniswap V3 and Aerodrome Slipstream simultaneously

## 📊 Monitored Pools

| DEX | Pool Address | Pair |
|-----|--------------|------|
| **Uniswap V3** | `0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef` | cbBTC/USDC |
| **Aerodrome Slipstream** | `0x4e962bb3889bf030368f56810a9c96b83cb3e778` | cbBTC/USDC |

### Token Addresses
- **cbBTC**: `0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf` (8 decimals)
- **USDC**: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals)

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ 
- npm or yarn
- Base RPC endpoint (Infura, Alchemy, or public RPC)

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd "Arbitrage Bot Base"
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
```

Edit `.env` and add your RPC URL:
```env
BASE_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_API_KEY
```

4. **Run the monitor**
```bash
node index.js
```

## 📖 How It Works

1. **Connects to Base mainnet** via your configured RPC endpoint
2. **Initializes both pools** and detects token ordering
3. **Reads initial prices** from both Uniswap V3 and Aerodrome Slipstream
4. **Calculates initial spread** between the two DEXes
5. **Listens for Swap events** on both pools
6. **Logs price updates** when prices change significantly (>$0.01)
7. **Displays spread** showing arbitrage opportunities

## 📺 Example Output

```
🚀 Starting Dual DEX cbBTC/USDC Price Monitor on Base
   📊 Uniswap V3 + Aerodrome Slipstream

================================================================================
🦄 UNISWAP V3 INITIALIZATION
================================================================================
💰 Initial Uniswap V3 Price: 1 cbBTC = 90,649.05 USDC

================================================================================
🌀 AERODROME SLIPSTREAM INITIALIZATION
================================================================================
💰 Initial Aerodrome Slipstream Price: 1 cbBTC = 90,630.96 USDC
📊 Initial Spread (Aerodrome vs Uniswap): -0.020%

================================================================================
👀 MONITORING STARTED - Listening for price changes...
================================================================================

[8:15:23 PM] 📈 UNISWAP V3 Price Update
   Price: 1 cbBTC = 90,655.12 USDC
   Change: +0.007%
   Spread vs Aerodrome: +0.026%
   Tx: 0xabc123...
```

## 🏗️ Technical Details

### Price Calculation
Both Uniswap V3 and Aerodrome Slipstream use the same concentrated liquidity model with `sqrtPriceX96` format:

```javascript
price = (sqrtPriceX96 / 2^96)^2 * (10^decimalsToken0 / 10^decimalsToken1)
```

The script uses BigInt arithmetic to avoid precision loss when calculating prices.

### Token Ordering
The script automatically detects whether cbBTC is `token0` or `token1` in each pool and adjusts calculations accordingly.

### Event Listening
Monitors the `Swap` event on both pools:
```solidity
event Swap(
    address indexed sender,
    address indexed recipient,
    int256 amount0,
    int256 amount1,
    uint160 sqrtPriceX96,
    uint128 liquidity,
    int24 tick
)
```

## 📦 Dependencies

- **ethers.js v6** - Ethereum library for blockchain interaction
- **dotenv** - Environment variable management

## 🔧 Configuration

Edit `index.js` to customize:
- Price change threshold (default: $0.01)
- Logging format
- Pool addresses
- Token decimals

## ⚠️ Notes

- This is a **monitoring tool only** - it does not execute trades
- Requires a stable RPC connection for real-time monitoring
- Public RPC endpoints may have rate limits
- Consider using a paid RPC provider (Infura, Alchemy) for production use

## 📝 License

MIT

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## ⚡ Roadmap

- [ ] Add more DEX integrations
- [ ] Historical spread tracking
- [ ] Alert system for large spreads
- [ ] Web dashboard for monitoring
- [ ] Trade execution integration

---

**Disclaimer**: This tool is for educational purposes only. Always do your own research before trading.
