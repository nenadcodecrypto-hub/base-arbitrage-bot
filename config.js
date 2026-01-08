import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

/**
 * Configuration loader with validation
 * Reads all configuration from environment variables
 * Throws error if required variables are missing
 */

// Helper function to get required environment variable
function getRequiredEnv(key, description) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key} (${description})`);
  }
  return value;
}

// Helper function to get optional environment variable with default
function getOptionalEnv(key, defaultValue) {
  return process.env[key] || defaultValue;
}

// Helper function to parse integer with validation
function parseIntSafe(value, key) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer value for ${key}: ${value}`);
  }
  return parsed;
}

// Helper function to parse float with validation
function parseFloatSafe(value, key) {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`Invalid float value for ${key}: ${value}`);
  }
  return parsed;
}

// ===== CONFIGURATION OBJECT =====
const config = {
  // RPC Configuration
  rpc: {
    baseUrl: getRequiredEnv("BASE_RPC_URL", "Base mainnet RPC endpoint"),
  },

  // Token Configuration
  tokens: {
    cbBTC: {
      address: getRequiredEnv("CB_BTC_ADDRESS", "cbBTC token address on Base"),
      decimals: parseIntSafe(
        getRequiredEnv("CB_BTC_DECIMALS", "cbBTC token decimals"),
        "CB_BTC_DECIMALS"
      ),
      symbol: "cbBTC",
    },
    USDC: {
      address: getRequiredEnv("USDC_ADDRESS", "USDC token address on Base"),
      decimals: parseIntSafe(
        getRequiredEnv("USDC_DECIMALS", "USDC token decimals"),
        "USDC_DECIMALS"
      ),
      symbol: "USDC",
    },
  },

  // Pool Configuration
  pools: {
    uniswap: {
      cbBTC_USDC: getRequiredEnv(
        "UNISWAP_POOL_ADDRESS",
        "Uniswap V3 cbBTC/USDC pool address"
      ),
    },
    aerodrome: {
      cbBTC_USDC: getRequiredEnv(
        "AERODROME_POOL_ADDRESS",
        "Aerodrome Slipstream cbBTC/USDC pool address"
      ),
    },
  },

  // Monitoring Thresholds
  thresholds: {
    // Minimum price change (in USDC) to trigger logging
    priceChange: parseFloatSafe(
      getOptionalEnv("PRICE_CHANGE_THRESHOLD", "0.01"),
      "PRICE_CHANGE_THRESHOLD"
    ),
    // Optional: minimum spread percentage to log
    spread: parseFloatSafe(
      getOptionalEnv("SPREAD_LOG_THRESHOLD", "0.0"),
      "SPREAD_LOG_THRESHOLD"
    ),
  },

  // Cost Model Configuration
  costs: {
    uniswapGasFeeUSDC: parseFloatSafe(
      getOptionalEnv("UNISWAP_GAS_FEE_USDC", "0.004"),
      "UNISWAP_GAS_FEE_USDC"
    ),
    aerodromeGasFeeUSDC: parseFloatSafe(
      getOptionalEnv("AERODROME_GAS_FEE_USDC", "0.005"),
      "AERODROME_GAS_FEE_USDC"
    ),
    aerodromeFeeBps: parseFloatSafe(
      getOptionalEnv("AERODROME_FEE_BPS", "1"),
      "AERODROME_FEE_BPS"
    ),
  },

  // Arbitrage Simulation Configuration
  arbitrage: {
    // Trade size for simulation (in cbBTC)
    tradeSizeCbBTC: parseFloatSafe(
      getOptionalEnv("ARB_TRADE_SIZE_CBBTC", "0.1"),
      "ARB_TRADE_SIZE_CBBTC"
    ),
  },
};

// Validate configuration
console.log("✅ Configuration loaded successfully:");
console.log(`   RPC: ${config.rpc.baseUrl}`);
console.log(`   ${config.tokens.cbBTC.symbol}: ${config.tokens.cbBTC.address} (${config.tokens.cbBTC.decimals} decimals)`);
console.log(`   ${config.tokens.USDC.symbol}: ${config.tokens.USDC.address} (${config.tokens.USDC.decimals} decimals)`);
console.log(`   Uniswap Pool: ${config.pools.uniswap.cbBTC_USDC}`);
console.log(`   Aerodrome Pool: ${config.pools.aerodrome.cbBTC_USDC}`);
console.log(`   Price Change Threshold: $${config.thresholds.priceChange}`);
console.log(`   Uniswap Gas Fee: $${config.costs.uniswapGasFeeUSDC} USDC`);
console.log(`   Aerodrome Gas Fee: $${config.costs.aerodromeGasFeeUSDC} USDC`);
console.log(`   Aerodrome Trade Fee: ${config.costs.aerodromeFeeBps} bps (${(config.costs.aerodromeFeeBps / 100).toFixed(2)}%)`);
console.log(`   Arb Trade Size: ${config.arbitrage.tradeSizeCbBTC} cbBTC`);
console.log();

export default config;
