import { ethers } from "ethers";
import config from "./config.js";

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   TRIPLE DEX PRICE MONITOR: Uniswap V3 + Aerodrome + PancakeSwap V3 (Base)  ║
 * ║   Monitors cbBTC/USDC pair on three DEXes and calculates spreads             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * This script monitors the cbBTC/USDC price on three DEXes on Base.
 * All configuration is loaded from environment variables via config.js
 * 
 * Features:
 * - Real-time price monitoring via Swap events on all three DEXes
 * - Automatic token ordering detection (handles token0/token1 variations)
 * - High-precision BigInt calculations for accurate pricing
 * - Pairwise spread calculation across all DEX combinations
 * - Arbitrage simulation for the best spread (fee and gas adjusted)
 * - Formatted logging with timestamps and transaction hashes
 * - Fully configurable via .env file
 * 
 * Configuration loaded from .env:
 * - BASE_RPC_URL: RPC endpoint for Base blockchain
 * - CB_BTC_ADDRESS, USDC_ADDRESS: Token addresses
 * - CB_BTC_DECIMALS, USDC_DECIMALS: Token decimals
 * - UNISWAP_POOL_ADDRESS, AERODROME_POOL_ADDRESS, PANCAKE_V3_POOL_ADDRESS: Pool addresses
 * - PRICE_CHANGE_THRESHOLD: Minimum price change to log
 */

// ===== UNISWAP V3 POOL ABI =====
const UNISWAP_POOL_ABI = [
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

// ===== AERODROME SLIPSTREAM POOL ABI =====
// Full ABI from Basescan for Aerodrome Slipstream pool on Base
// Pool uses Uniswap V3 compatible interface: token0(), token1(), slot0(), and Swap event
const AERODROME_POOL_ABI = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":false,"internalType":"address","name":"recipient","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"Collect","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint128","name":"amount0","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"amount1","type":"uint128"}],"name":"CollectFees","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"paid1","type":"uint256"}],"name":"Flash","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextOld","type":"uint16"},{"indexed":false,"internalType":"uint16","name":"observationCardinalityNextNew","type":"uint16"}],"name":"IncreaseObservationCardinalityNext","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Initialize","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"int24","name":"tickLower","type":"int24"},{"indexed":true,"internalType":"int24","name":"tickUpper","type":"int24"},{"indexed":false,"internalType":"uint128","name":"amount","type":"uint128"},{"indexed":false,"internalType":"uint256","name":"amount0","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount1","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint8","name":"feeProtocol0Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1Old","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol0New","type":"uint8"},{"indexed":false,"internalType":"uint8","name":"feeProtocol1New","type":"uint8"}],"name":"SetFeeProtocol","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"sender","type":"address"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"int256","name":"amount0","type":"int256"},{"indexed":false,"internalType":"int256","name":"amount1","type":"int256"},{"indexed":false,"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"indexed":false,"internalType":"uint128","name":"liquidity","type":"uint128"},{"indexed":false,"internalType":"int24","name":"tick","type":"int24"}],"name":"Swap","type":"event"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"},{"internalType":"address","name":"owner","type":"address"}],"name":"burn","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"}],"name":"burn","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"},{"internalType":"address","name":"owner","type":"address"}],"name":"collect","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount0Requested","type":"uint128"},{"internalType":"uint128","name":"amount1Requested","type":"uint128"}],"name":"collect","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"collectFees","outputs":[{"internalType":"uint128","name":"amount0","type":"uint128"},{"internalType":"uint128","name":"amount1","type":"uint128"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"factory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"factoryRegistry","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint24","name":"","type":"uint24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal0X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"feeGrowthGlobal1X128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"flash","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"gauge","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"gaugeFees","outputs":[{"internalType":"uint128","name":"token0","type":"uint128"},{"internalType":"uint128","name":"token1","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint256","name":"_rewardGrowthGlobalX128","type":"uint256"}],"name":"getRewardGrowthInside","outputs":[{"internalType":"uint256","name":"rewardGrowthInside","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"}],"name":"increaseObservationCardinalityNext","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_factory","type":"address"},{"internalType":"address","name":"_token0","type":"address"},{"internalType":"address","name":"_token1","type":"address"},{"internalType":"int24","name":"_tickSpacing","type":"int24"},{"internalType":"address","name":"_factoryRegistry","type":"address"},{"internalType":"uint160","name":"_sqrtPriceX96","type":"uint160"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"lastUpdated","outputs":[{"internalType":"uint32","name":"","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"liquidity","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"maxLiquidityPerTick","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"uint128","name":"amount","type":"uint128"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"mint","outputs":[{"internalType":"uint256","name":"amount0","type":"uint256"},{"internalType":"uint256","name":"amount1","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"nft","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"observations","outputs":[{"internalType":"uint32","name":"blockTimestamp","type":"uint32"},{"internalType":"int56","name":"tickCumulative","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityCumulativeX128","type":"uint160"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint32[]","name":"secondsAgos","type":"uint32[]"}],"name":"observe","outputs":[{"internalType":"int56[]","name":"tickCumulatives","type":"int56[]"},{"internalType":"uint160[]","name":"secondsPerLiquidityCumulativeX128s","type":"uint160[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"periodFinish","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"positions","outputs":[{"internalType":"uint128","name":"liquidity","type":"uint128"},{"internalType":"uint256","name":"feeGrowthInside0LastX128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthInside1LastX128","type":"uint256"},{"internalType":"uint128","name":"tokensOwed0","type":"uint128"},{"internalType":"uint128","name":"tokensOwed1","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rewardGrowthGlobalX128","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rewardRate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rewardReserve","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rollover","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_gauge","type":"address"},{"internalType":"address","name":"_nft","type":"address"}],"name":"setGaugeAndPositionManager","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"slot0","outputs":[{"internalType":"uint160","name":"sqrtPriceX96","type":"uint160"},{"internalType":"int24","name":"tick","type":"int24"},{"internalType":"uint16","name":"observationIndex","type":"uint16"},{"internalType":"uint16","name":"observationCardinality","type":"uint16"},{"internalType":"uint16","name":"observationCardinalityNext","type":"uint16"},{"internalType":"bool","name":"unlocked","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"}],"name":"snapshotCumulativesInside","outputs":[{"internalType":"int56","name":"tickCumulativeInside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityInsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsInside","type":"uint32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int128","name":"stakedLiquidityDelta","type":"int128"},{"internalType":"int24","name":"tickLower","type":"int24"},{"internalType":"int24","name":"tickUpper","type":"int24"},{"internalType":"bool","name":"positionUpdate","type":"bool"}],"name":"stake","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"stakedLiquidity","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"recipient","type":"address"},{"internalType":"bool","name":"zeroForOne","type":"bool"},{"internalType":"int256","name":"amountSpecified","type":"int256"},{"internalType":"uint160","name":"sqrtPriceLimitX96","type":"uint160"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"swap","outputs":[{"internalType":"int256","name":"amount0","type":"int256"},{"internalType":"int256","name":"amount1","type":"int256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_rewardRate","type":"uint256"},{"internalType":"uint256","name":"_rewardReserve","type":"uint256"},{"internalType":"uint256","name":"_periodFinish","type":"uint256"}],"name":"syncReward","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"int16","name":"","type":"int16"}],"name":"tickBitmap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"tickSpacing","outputs":[{"internalType":"int24","name":"","type":"int24"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"int24","name":"","type":"int24"}],"name":"ticks","outputs":[{"internalType":"uint128","name":"liquidityGross","type":"uint128"},{"internalType":"int128","name":"liquidityNet","type":"int128"},{"internalType":"int128","name":"stakedLiquidityNet","type":"int128"},{"internalType":"uint256","name":"feeGrowthOutside0X128","type":"uint256"},{"internalType":"uint256","name":"feeGrowthOutside1X128","type":"uint256"},{"internalType":"uint256","name":"rewardGrowthOutsideX128","type":"uint256"},{"internalType":"int56","name":"tickCumulativeOutside","type":"int56"},{"internalType":"uint160","name":"secondsPerLiquidityOutsideX128","type":"uint160"},{"internalType":"uint32","name":"secondsOutside","type":"uint32"},{"internalType":"bool","name":"initialized","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token0","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token1","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"unstakedFee","outputs":[{"internalType":"uint24","name":"","type":"uint24"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"updateRewardsGrowthGlobal","outputs":[],"stateMutability":"nonpayable","type":"function"}];

// ===== HELPER FUNCTIONS =====
/**
 * Calculate price from sqrtPriceX96
 * Formula: price = (sqrtPriceX96 / 2^96)^2 * (10^decimalsToken0 / 10^decimalsToken1)
 * This gives us the price of token0 in terms of token1
 * 
 * @param {bigint} sqrtPriceX96 - Square root price from Uniswap V3
 * @param {boolean} isInverted - Whether cbBTC is token1 (true) or token0 (false)
 * @returns {number} Price of cbBTC in USDC
 */
/**
 * Calculate price from sqrtPriceX96
 * Formula: price = (sqrtPriceX96 / 2^96)^2 * (10^decimalsToken1 / 10^decimalsToken0)
 * This gives us the price of token1 in terms of token0
 * 
 * @param {bigint} sqrtPriceX96 - Square root price from Uniswap V3
 * @param {boolean} isInverted - Whether cbBTC is token1 (true) or token0 (false)
 * @returns {number} Price of cbBTC in USDC
 */
function calculatePrice(sqrtPriceX96, isInverted) {
  // Using BigInt for precision
  // sqrtPriceX96 = sqrt(price) * 2^96
  // price = (sqrtPriceX96 / 2^96)^2
  
  // To avoid precision loss, we calculate: price = (sqrtPriceX96^2) / (2^192)
  const Q96 = 2n ** 96n;
  const sqrtPriceX96BigInt = BigInt(sqrtPriceX96);
  
  if (isInverted) {
    // cbBTC is token1, USDC is token0
    // price = token1/token0 = cbBTC/USDC (in raw units)
    // To get USDC per cbBTC, we need to invert and adjust for decimals
    
    // Calculate price with decimal adjustment using config values
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(config.tokens.USDC.decimals));
    const denominator = Q96 * Q96 * (10n ** BigInt(config.tokens.cbBTC.decimals));
    
    // Convert to number (this gives cbBTC per USDC)
    const cbBTCperUSDC = Number(numerator) / Number(denominator);
    
    // Invert to get USDC per cbBTC
    return 1 / cbBTCperUSDC;
  } else {
    // cbBTC is token0, USDC is token1
    // price = token1/token0 = USDC/cbBTC (in raw units)
    
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(config.tokens.USDC.decimals));
    const denominator = Q96 * Q96 * (10n ** BigInt(config.tokens.cbBTC.decimals));
    
    return Number(numerator) / Number(denominator);
  }
}

/**
 * Format price for display
 */
function formatPrice(price) {
  return price.toFixed(2);
}

/**
 * Calculate Aerodrome Slipstream price from sqrtPriceX96
 * Aerodrome Slipstream uses the same Uniswap V3 concentrated liquidity model
 * with sqrtPriceX96 format confirmed from the contract ABI
 * 
 * @param {bigint} sqrtPriceX96 - Square root price from Aerodrome Slipstream (X96 format)
 * @param {boolean} isInverted - Whether cbBTC is token1 (true) or token0 (false)
 * @returns {number} Price of cbBTC in USDC
 */
function calculateAerodromePrice(sqrtPriceX96, isInverted) {
  // Aerodrome Slipstream uses the same sqrtPriceX96 format as Uniswap V3
  const Q96 = 2n ** 96n;
  const sqrtPriceX96BigInt = BigInt(sqrtPriceX96);
  
  if (isInverted) {
    // cbBTC is token1, USDC is token0
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(config.tokens.USDC.decimals));
    const denominator = Q96 * Q96 * (10n ** BigInt(config.tokens.cbBTC.decimals));
    const cbBTCperUSDC = Number(numerator) / Number(denominator);
    return 1 / cbBTCperUSDC;
  } else {
    // cbBTC is token0, USDC is token1
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(config.tokens.USDC.decimals));
    const denominator = Q96 * Q96 * (10n ** BigInt(config.tokens.cbBTC.decimals));
    return Number(numerator) / Number(denominator);
  }
}

/**
 * Calculate and format spread between two prices
 */
function calculateSpread(price1, price2) {
  return ((price1 - price2) / price2) * 100;
}

/**
 * Format spread for display
 */
function formatSpread(spread) {
  const sign = spread >= 0 ? "+" : "";
  return `${sign}${spread.toFixed(3)}%`;
}

// ===== FEE & GAS HELPERS =====

/**
 * Calculate USDC trade size from overall budget and percentage allocation
 * @param {number} overallBudgetUSDC - Total arbitrage budget in USDC
 * @param {number} budgetPercent - Percentage of budget to use per trade (0-100)
 * @returns {number} Trade size in USDC
 */
function getArbTradeSizeUSDC(overallBudgetUSDC, budgetPercent) {
  return overallBudgetUSDC * (budgetPercent / 100);
}

/**
 * Get fee and gas information for a DEX
 * @param {string} dexName - DEX name ("Uniswap", "Aerodrome", "PancakeSwap")
 * @returns {Object} { feeBps, gasFeeUSDC } or { fixedFeeUSDC, gasFeeUSDC } for PancakeSwap
 */
function getDexCostModel(dexName) {
  switch (dexName) {
    case "Uniswap":
      return { feeBps: 0, gasFeeUSDC: config.costs.uniswapGasFeeUSDC };
    case "Aerodrome":
      return { feeBps: config.costs.aerodromeFeeBps, gasFeeUSDC: config.costs.aerodromeGasFeeUSDC };
    case "PancakeSwap":
      return { fixedFeeUSDC: config.costs.pancakeFixedFeeUSDC, gasFeeUSDC: config.costs.pancakeGasFeeUSDC };
    default:
      throw new Error(`Unknown DEX: ${dexName}`);
  }
}

/**
 * Apply a DEX's trade fee to a USDC amount
 * @param {number} amountUSDC - USDC notional of the trade
 * @param {number} feeBps - Fee in basis points (1 bps = 0.01%)
 * @returns {number} Amount after fee deduction
 */
function applyTradeFeeUSDC(amountUSDC, feeBps) {
  if (feeBps === 0) return amountUSDC;
  return amountUSDC * (1 - feeBps / 10_000);
}

/**
 * Calculate total gas cost for an arbitrage direction
 * @param {string} buyDex - DEX where cbBTC is bought
 * @param {string} sellDex - DEX where cbBTC is sold
 * @returns {number} Total gas cost in USDC
 */
function totalGasCostForDirection(buyDex, sellDex) {
  const buyGas = getDexCostModel(buyDex).gasFeeUSDC;
  const sellGas = getDexCostModel(sellDex).gasFeeUSDC;
  return buyGas + sellGas;
}

// ===== ARBITRAGE SIMULATION =====

/**
 * Simulate arbitrage between any two DEXes
 * @param {string} dex1Name - First DEX ("Uniswap", "Aerodrome", "PancakeSwap")
 * @param {number} dex1Price - cbBTC price on DEX1 (USDC per cbBTC)
 * @param {string} dex2Name - Second DEX
 * @param {number} dex2Price - cbBTC price on DEX2 (USDC per cbBTC)
 * @param {number} currentBudgetUSDC - Current overall budget (may have compounded from previous trades)
 * @param {number} budgetPct - Percentage of budget to use per trade
 * @returns {Object} Best arbitrage direction with budget info
 */
function simulateArbitrageForPair(dex1Name, dex1Price, dex2Name, dex2Price, currentBudgetUSDC, budgetPct) {
  // Calculate USDC trade size from current budget percentage
  const tradeSizeUSDC = getArbTradeSizeUSDC(currentBudgetUSDC, budgetPct);
  
  // Direction A: Buy on DEX1, Sell on DEX2
  // Convert USDC to cbBTC using DEX1's price (where we buy)
  const tradeSizeCbBTC_A = tradeSizeUSDC / dex1Price;
  const directionA = calculateArbDirection({
    buyDex: dex1Name,
    sellDex: dex2Name,
    buyPrice: dex1Price,
    sellPrice: dex2Price,
    tradeSizeCbBTC: tradeSizeCbBTC_A,
    tradeSizeUSDC,
    currentBudgetUSDC,
  });
  
  // Direction B: Buy on DEX2, Sell on DEX1
  // Convert USDC to cbBTC using DEX2's price (where we buy)
  const tradeSizeCbBTC_B = tradeSizeUSDC / dex2Price;
  const directionB = calculateArbDirection({
    buyDex: dex2Name,
    sellDex: dex1Name,
    buyPrice: dex2Price,
    sellPrice: dex1Price,
    tradeSizeCbBTC: tradeSizeCbBTC_B,
    tradeSizeUSDC,
    currentBudgetUSDC,
  });
  
  return directionA.netProfitUSDC > directionB.netProfitUSDC ? directionA : directionB;
}

/**
 * Calculate arbitrage for a specific direction using the new cost model
 * @param {Object} params - Calculation parameters
 * @param {string} params.buyDex - DEX where cbBTC is bought
 * @param {string} params.sellDex - DEX where cbBTC is sold
 * @param {number} params.buyPrice - Buy price (USDC per cbBTC)
 * @param {number} params.sellPrice - Sell price (USDC per cbBTC)
 * @param {number} params.tradeSizeCbBTC - cbBTC trade size
 * @param {number} params.tradeSizeUSDC - USDC trade size (for logging)
 * @param {number} params.currentBudgetUSDC - Current overall budget (for tracking compounding)
 * @returns {Object} Calculation result
 */
function calculateArbDirection({
  buyDex,
  sellDex,
  buyPrice,
  sellPrice,
  tradeSizeCbBTC,
  tradeSizeUSDC,
  currentBudgetUSDC,
}) {
  const buyModel = getDexCostModel(buyDex);
  const sellModel = getDexCostModel(sellDex);
  
  // Buy leg
  const usdcSpentBeforeFee = tradeSizeCbBTC * buyPrice;
  let usdcSpentAfterFee;
  let buyTradeFeesUSDC = 0;
  
  if (buyModel.fixedFeeUSDC !== undefined) {
    // PancakeSwap: fixed fee
    usdcSpentAfterFee = usdcSpentBeforeFee + buyModel.fixedFeeUSDC;
    buyTradeFeesUSDC = buyModel.fixedFeeUSDC;
  } else {
    // Uniswap/Aerodrome: percentage fee
    buyTradeFeesUSDC = usdcSpentBeforeFee * (buyModel.feeBps / 10_000);
    usdcSpentAfterFee = usdcSpentBeforeFee + buyTradeFeesUSDC;
  }
  
  // Sell leg
  const usdcReceivedBeforeFee = tradeSizeCbBTC * sellPrice;
  let usdcReceivedAfterFee;
  let sellTradeFeesUSDC = 0;
  
  if (sellModel.fixedFeeUSDC !== undefined) {
    // PancakeSwap: fixed fee (deducted from revenue)
    usdcReceivedAfterFee = usdcReceivedBeforeFee - sellModel.fixedFeeUSDC;
    sellTradeFeesUSDC = sellModel.fixedFeeUSDC;
  } else {
    // Uniswap/Aerodrome: percentage fee
    sellTradeFeesUSDC = usdcReceivedBeforeFee * (sellModel.feeBps / 10_000);
    usdcReceivedAfterFee = usdcReceivedBeforeFee - sellTradeFeesUSDC;
  }
  
  // Gas costs
  const totalGasCostUSDC = totalGasCostForDirection(buyDex, sellDex);
  
  // Profit
  const netUSDC = usdcReceivedAfterFee - totalGasCostUSDC;
  const netProfitUSDC = netUSDC - usdcSpentAfterFee;
  const netProfitPct = (netProfitUSDC / usdcSpentAfterFee) * 100;
  
  return {
    isProfitable: netProfitUSDC > 0,
    netProfitUSDC,
    netProfitPct,
    direction: `Buy on ${buyDex}, Sell on ${sellDex}`,
    buyDex,
    sellDex,
    details: {
      currentBudgetUSDC,
      tradeSizeUSDC,
      tradeSizeCbBTC,
      buyPrice,
      sellPrice,
      usdcSpentBeforeFee,
      usdcSpentAfterFee,
      usdcReceivedBeforeFee,
      usdcReceivedAfterFee,
      buyDexName: buyDex,
      sellDexName: sellDex,
      buyModel,
      sellModel,
      buyTradeFeesUSDC,
      sellTradeFeesUSDC,
      totalGasCostUSDC,
    },
  };
}

/**
 * Log arbitrage opportunity in a formatted way with budget compounding
 * @param {Object} arbResult - Result from calculateArbDirection()
 */
function logArbitrageOpportunity(arbResult) {
  const d = arbResult.details;
  const newBudgetUSDC = d.currentBudgetUSDC + arbResult.netProfitUSDC;
  
  // Build fee labels for both buy and sell legs
  let buyFeeLabel = "";
  if (d.buyModel.fixedFeeUSDC !== undefined) {
    buyFeeLabel = `$${d.buyModel.fixedFeeUSDC.toFixed(4)} (fixed)`;
  } else if (d.buyModel.feeBps > 0) {
    buyFeeLabel = `${d.buyModel.feeBps} bps`;
  }
  
  let sellFeeLabel = "";
  if (d.sellModel.fixedFeeUSDC !== undefined) {
    sellFeeLabel = `$${d.sellModel.fixedFeeUSDC.toFixed(4)} (fixed)`;
  } else if (d.sellModel.feeBps > 0) {
    sellFeeLabel = `${d.sellModel.feeBps} bps`;
  }
  
  const totalFees = d.buyTradeFeesUSDC + d.sellTradeFeesUSDC;
  const spread = d.usdcReceivedBeforeFee - d.usdcSpentBeforeFee;
  
  if (!arbResult.isProfitable) {
    console.log(`💤 Not profitable after fees/gas (best: ${arbResult.direction}, net: $${arbResult.netProfitUSDC.toFixed(2)})`);
    console.log(`   📊 Spread: $${spread.toFixed(2)} | Fees: $${totalFees.toFixed(4)} | Gas: $${d.totalGasCostUSDC.toFixed(4)} | Net: $${arbResult.netProfitUSDC.toFixed(2)}`);
    return;
  }
  
  console.log("\n" + "═".repeat(80));
  console.log("💰 PROFITABLE ARBITRAGE OPPORTUNITY DETECTED!");
  console.log("═".repeat(80));
  console.log(`📍 Direction: ${arbResult.direction}`);
  console.log(`📊 Trade Size: $${d.tradeSizeUSDC.toFixed(2)} USDC (${d.tradeSizeCbBTC.toFixed(8)} cbBTC)`);
  console.log(`💵 Net Profit: $${arbResult.netProfitUSDC.toFixed(2)} USDC (${arbResult.netProfitPct.toFixed(3)}%)`);
  console.log();
  console.log("📋 BUY LEG - " + d.buyDexName + ":");
  console.log(`   Price: $${d.buyPrice.toFixed(2)} per cbBTC`);
  console.log(`   Cost before fee: $${d.usdcSpentBeforeFee.toFixed(2)}`);
  if (buyFeeLabel) {
    console.log(`   Trade Fee: ${buyFeeLabel}`);
  }
  console.log(`   ✅ Total USDC Spent: $${d.usdcSpentAfterFee.toFixed(2)}`);
  console.log();
  console.log("📋 SELL LEG - " + d.sellDexName + ":");
  console.log(`   Price: $${d.sellPrice.toFixed(2)} per cbBTC`);
  console.log(`   Revenue before fee: $${d.usdcReceivedBeforeFee.toFixed(2)}`);
  if (sellFeeLabel) {
    console.log(`   Trade Fee: ${sellFeeLabel}`);
  }
  console.log(`   ✅ Total USDC Received: $${d.usdcReceivedAfterFee.toFixed(2)}`);
  console.log();
  console.log("📋 SUMMARY:");
  console.log(`   Gross Spread: $${spread.toFixed(2)}`);
  console.log(`   Total Fees: $${totalFees.toFixed(4)}`);
  console.log(`   Gas: $${d.totalGasCostUSDC.toFixed(4)}`);
  console.log(`   Net Profit: $${arbResult.netProfitUSDC.toFixed(2)}`);
  console.log();
  console.log("📊 BUDGET COMPOUNDING:");
  console.log(`   Previous Budget: $${d.currentBudgetUSDC.toFixed(2)} USDC`);
  console.log(`   Profit Added: +$${arbResult.netProfitUSDC.toFixed(4)} USDC`);
  console.log(`   📈 New Budget: $${newBudgetUSDC.toFixed(2)} USDC`);
  console.log("═".repeat(80) + "\n");
}

// ===== MAIN MONITORING LOGIC =====
async function monitorPool() {
  console.log("🚀 Starting Triple DEX cbBTC/USDC Price Monitor on Base");
  console.log("   📊 Uniswap V3 + Aerodrome Slipstream + PancakeSwap V3\n");
  
  // Initialize mutable budget (compounds as trades are simulated as profitable)
  let overallBudgetUSDC = parseFloat(process.env.ARB_OVERALL_BUDGET_USDC || "0");
  const budgetPercent = parseFloat(process.env.ARB_BUDGET_PERCENT || "0");
  
  console.log(`📊 Initial Budget: $${overallBudgetUSDC.toFixed(2)} USDC (${budgetPercent}% per trade = $${(overallBudgetUSDC * budgetPercent / 100).toFixed(2)} USDC)\n`);
  
  // Connect to Base mainnet using WebSocket for real-time events
  const provider = new ethers.WebSocketProvider(config.rpc.baseWssUrl);
  console.log(`📡 Connected to Base WSS: ${config.rpc.baseWssUrl}\n`);
  
  // ===== UNISWAP V3 INITIALIZATION =====
  console.log("=" .repeat(80));
  console.log("🦄 UNISWAP V3 INITIALIZATION");
  console.log("=".repeat(80));
  console.log(`📍 Pool Address: ${config.pools.uniswap.cbBTC_USDC}\n`);
  
  // Create Uniswap pool contract instance using address from config
  const uniswapPool = new ethers.Contract(config.pools.uniswap.cbBTC_USDC, UNISWAP_POOL_ABI, provider);
  
  // Variables to track prices
  let lastUniswapPrice = 0;
  let lastAerodromePrice = 0;
  let lastPancakePrice = 0;
  let uniswapIsInverted = false;
  let aerodromeIsInverted = false;
  let pancakeIsInverted = false;
  
  try {
    // ===== UNISWAP V3 SETUP =====
    // Detect token ordering
    console.log("🔍 Detecting token ordering...");
    const uniToken0 = await uniswapPool.token0();
    const uniToken1 = await uniswapPool.token1();
    
    // Check if cbBTC is token0 or token1 using addresses from config
    uniswapIsInverted = uniToken0.toLowerCase() === config.tokens.USDC.address.toLowerCase();
    
    console.log(`   Token0: ${uniToken0}`);
    console.log(`   Token1: ${uniToken1}`);
    console.log(`   cbBTC is: ${uniswapIsInverted ? 'token1' : 'token0'}`);
    console.log(`   USDC is: ${uniswapIsInverted ? 'token0' : 'token1'}\n`);
    
    // Get initial price from slot0
    console.log("📊 Reading initial price from slot0...");
    const uniSlot0 = await uniswapPool.slot0();
    lastUniswapPrice = calculatePrice(uniSlot0.sqrtPriceX96, uniswapIsInverted);
    
    console.log(`💰 Initial Uniswap V3 Price: 1 cbBTC = ${formatPrice(lastUniswapPrice)} USDC\n`);
    
    // ===== AERODROME SLIPSTREAM SETUP =====
    console.log("=".repeat(80));
    console.log("🌀 AERODROME SLIPSTREAM INITIALIZATION");
    console.log("=".repeat(80));
    console.log(`📍 Pool Address: ${config.pools.aerodrome.cbBTC_USDC}\n`);
    
    // Create Aerodrome pool contract instance using address from config
    // Using the full ABI from Basescan - Slipstream is Uniswap V3 compatible
    const aerodromePool = new ethers.Contract(config.pools.aerodrome.cbBTC_USDC, AERODROME_POOL_ABI, provider);
    
    // Detect Aerodrome token ordering
    console.log("🔍 Detecting token ordering...");
    const aeroToken0 = await aerodromePool.token0();
    const aeroToken1 = await aerodromePool.token1();
    
    aerodromeIsInverted = aeroToken0.toLowerCase() === config.tokens.USDC.address.toLowerCase();
    
    console.log(`   Token0: ${aeroToken0}`);
    console.log(`   Token1: ${aeroToken1}`);
    console.log(`   cbBTC is: ${aerodromeIsInverted ? 'token1' : 'token0'}`);
    console.log(`   USDC is: ${aerodromeIsInverted ? 'token0' : 'token1'}\n`);
    
    // Get initial Aerodrome price
    // Aerodrome Slipstream uses slot0() just like Uniswap V3 (confirmed from ABI)
    console.log("📊 Reading initial price from Slipstream...");
    const aeroSlot0 = await aerodromePool.slot0();
    // Extract sqrtPriceX96 from slot0 return value (same structure as Uniswap V3)
    lastAerodromePrice = calculateAerodromePrice(aeroSlot0.sqrtPriceX96, aerodromeIsInverted);
    
    console.log(`💰 Initial Aerodrome Slipstream Price: 1 cbBTC = ${formatPrice(lastAerodromePrice)} USDC\n`);
    
    // ===== PANCAKESWAP V3 INITIALIZATION =====
    console.log("=".repeat(80));
    console.log("🥞 PANCAKESWAP V3 INITIALIZATION");
    console.log("=".repeat(80));
    console.log(`📍 Pool Address: ${config.pools.pancakeV3.cbBTC_USDC}\n`);
    
    // Create PancakeSwap V3 pool contract (using Uniswap V3 compatible ABI)
    const pancakePool = new ethers.Contract(config.pools.pancakeV3.cbBTC_USDC, UNISWAP_POOL_ABI, provider);
    
    // Detect PancakeSwap token ordering
    console.log("🔍 Detecting token ordering...");
    const pancakeToken0 = await pancakePool.token0();
    const pancakeToken1 = await pancakePool.token1();
    
    pancakeIsInverted = pancakeToken0.toLowerCase() === config.tokens.USDC.address.toLowerCase();
    
    console.log(`   Token0: ${pancakeToken0}`);
    console.log(`   Token1: ${pancakeToken1}`);
    console.log(`   cbBTC is: ${pancakeIsInverted ? 'token1' : 'token0'}`);
    console.log(`   USDC is: ${pancakeIsInverted ? 'token0' : 'token1'}\n`);
    
    // Get initial PancakeSwap price
    console.log("📊 Reading initial price from PancakeSwap V3...");
    const pancakeSlot0 = await pancakePool.slot0();
    lastPancakePrice = calculatePrice(pancakeSlot0.sqrtPriceX96, pancakeIsInverted);
    
    console.log(`💰 Initial PancakeSwap V3 Price: 1 cbBTC = ${formatPrice(lastPancakePrice)} USDC\n`);
    
    // ===== INITIAL SPREAD ANALYSIS =====
    console.log("=".repeat(80));
    console.log("📊 INITIAL SPREAD ANALYSIS");
    console.log("=".repeat(80));
    const spreadUniAero = calculateSpread(lastAerodromePrice, lastUniswapPrice);
    const spreadUniPancake = calculateSpread(lastPancakePrice, lastUniswapPrice);
    const spreadAeroPancake = calculateSpread(lastPancakePrice, lastAerodromePrice);
    
    console.log(`Uniswap vs Aerodrome: ${formatSpread(spreadUniAero)}`);
    console.log(`Uniswap vs PancakeSwap: ${formatSpread(spreadUniPancake)}`);
    console.log(`Aerodrome vs PancakeSwap: ${formatSpread(spreadAeroPancake)}`);
    
    // Find biggest spread
    const spreads = [
      { dex1: "Uniswap", dex2: "Aerodrome", spread: Math.abs(spreadUniAero), price1: lastUniswapPrice, price2: lastAerodromePrice },
      { dex1: "Uniswap", dex2: "PancakeSwap", spread: Math.abs(spreadUniPancake), price1: lastUniswapPrice, price2: lastPancakePrice },
      { dex1: "Aerodrome", dex2: "PancakeSwap", spread: Math.abs(spreadAeroPancake), price1: lastAerodromePrice, price2: lastPancakePrice },
    ];
    const maxSpreadPair = spreads.reduce((max, curr) => curr.spread > max.spread ? curr : max);
    
    console.log(`\n📈 Biggest spread: ${maxSpreadPair.dex1} vs ${maxSpreadPair.dex2} (${formatSpread(maxSpreadPair.spread)})\n`);
    
    // Simulate initial arbitrage for best pair
    console.log("🔍 Checking initial arbitrage opportunity...");
    const initialArbResult = simulateArbitrageForPair(maxSpreadPair.dex1, maxSpreadPair.price1, maxSpreadPair.dex2, maxSpreadPair.price2, overallBudgetUSDC, budgetPercent);
    logArbitrageOpportunity(initialArbResult);
    // Compound budget if profitable
    if (initialArbResult.isProfitable && initialArbResult.netProfitUSDC > 0) {
      overallBudgetUSDC += initialArbResult.netProfitUSDC;
    }
    
    console.log("=".repeat(80));
    console.log("👀 MONITORING STARTED - Listening for price changes...");
    console.log("=".repeat(80));
    console.log();
    
    // ===== HELPER FUNCTION: Find and simulate best spread =====
    const findAndSimulateBestSpread = () => {
      const spreadUniAero = calculateSpread(lastAerodromePrice, lastUniswapPrice);
      const spreadUniPancake = calculateSpread(lastPancakePrice, lastUniswapPrice);
      const spreadAeroPancake = calculateSpread(lastPancakePrice, lastAerodromePrice);
      
      const spreads = [
        { dex1: "Uniswap", dex2: "Aerodrome", spread: Math.abs(spreadUniAero), price1: lastUniswapPrice, price2: lastAerodromePrice },
        { dex1: "Uniswap", dex2: "PancakeSwap", spread: Math.abs(spreadUniPancake), price1: lastUniswapPrice, price2: lastPancakePrice },
        { dex1: "Aerodrome", dex2: "PancakeSwap", spread: Math.abs(spreadAeroPancake), price1: lastAerodromePrice, price2: lastPancakePrice },
      ];
      const maxSpreadPair = spreads.reduce((max, curr) => curr.spread > max.spread ? curr : max);
      
      console.log(`📈 Max spread: ${maxSpreadPair.dex1} vs ${maxSpreadPair.dex2} (${formatSpread(maxSpreadPair.spread)})`);
      
      // Simulate arbitrage for best pair with current (potentially compounded) budget
      const arbResult = simulateArbitrageForPair(maxSpreadPair.dex1, maxSpreadPair.price1, maxSpreadPair.dex2, maxSpreadPair.price2, overallBudgetUSDC, budgetPercent);
      logArbitrageOpportunity(arbResult);
      
      // Compound budget if profitable
      if (arbResult.isProfitable && arbResult.netProfitUSDC > 0) {
        const previousBudget = overallBudgetUSDC;
        overallBudgetUSDC += arbResult.netProfitUSDC;
        console.log(`💰 Budget updated: $${previousBudget.toFixed(2)} + $${arbResult.netProfitUSDC.toFixed(4)} = $${overallBudgetUSDC.toFixed(2)} USDC\n`);
      }
    };
    
    // ===== UNISWAP V3 EVENT LISTENER =====
    uniswapPool.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
      try {
        // Compute price directly from the event's sqrtPriceX96 argument
        const newPrice = calculatePrice(sqrtPriceX96, uniswapIsInverted);
        
        // Only log if price changed significantly (threshold from config)
        if (Math.abs(newPrice - lastUniswapPrice) > config.thresholds.priceChange) {
          const priceChange = ((newPrice - lastUniswapPrice) / lastUniswapPrice) * 100;
          const changeSymbol = priceChange >= 0 ? "📈" : "📉";
          
          console.log(`[${new Date().toLocaleTimeString()}] ${changeSymbol} UNISWAP V3 Price Update`);
          console.log(`   Price: 1 cbBTC = ${formatPrice(newPrice)} USDC`);
          console.log(`   Change: ${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(3)}%`);
          console.log(`   Tx: ${event.log.transactionHash}`);
          console.log("─".repeat(80));
          
          lastUniswapPrice = newPrice;
          findAndSimulateBestSpread();
        }
      } catch (error) {
        console.error("❌ Error processing Uniswap swap event:", error.message);
      }
    });
    
    // ===== AERODROME SLIPSTREAM EVENT LISTENER =====
    aerodromePool.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
      try {
        // Compute price directly from the event's sqrtPriceX96 argument
        const newPrice = calculateAerodromePrice(sqrtPriceX96, aerodromeIsInverted);
        
        // Only log if price changed significantly (threshold from config)
        if (Math.abs(newPrice - lastAerodromePrice) > config.thresholds.priceChange) {
          const priceChange = ((newPrice - lastAerodromePrice) / lastAerodromePrice) * 100;
          const changeSymbol = priceChange >= 0 ? "📈" : "📉";
          
          console.log(`[${new Date().toLocaleTimeString()}] ${changeSymbol} AERODROME SLIPSTREAM Price Update`);
          console.log(`   Price: 1 cbBTC = ${formatPrice(newPrice)} USDC`);
          console.log(`   Change: ${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(3)}%`);
          console.log(`   Tx: ${event.log.transactionHash}`);
          console.log("─".repeat(80));
          
          lastAerodromePrice = newPrice;
          findAndSimulateBestSpread();
        }
      } catch (error) {
        console.error("❌ Error processing Aerodrome swap event:", error.message);
      }
    });
    
    // ===== PANCAKESWAP V3 EVENT LISTENER =====
    pancakePool.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
      try {
        // Compute price directly from the event's sqrtPriceX96 argument
        const newPrice = calculatePrice(sqrtPriceX96, pancakeIsInverted);
        
        // Only log if price changed significantly (threshold from config)
        if (Math.abs(newPrice - lastPancakePrice) > config.thresholds.priceChange) {
          const priceChange = ((newPrice - lastPancakePrice) / lastPancakePrice) * 100;
          const changeSymbol = priceChange >= 0 ? "📈" : "📉";
          
          console.log(`[${new Date().toLocaleTimeString()}] ${changeSymbol} PANCAKESWAP V3 Price Update`);
          console.log(`   Price: 1 cbBTC = ${formatPrice(newPrice)} USDC`);
          console.log(`   Change: ${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(3)}%`);
          console.log(`   Tx: ${event.log.transactionHash}`);
          console.log("─".repeat(80));
          
          lastPancakePrice = newPrice;
          findAndSimulateBestSpread();
        }
      } catch (error) {
        console.error("❌ Error processing PancakeSwap swap event:", error.message);
      }
    });
    
    // Keep the process alive
    process.on("SIGINT", () => {
      console.log("\n\n👋 Shutting down monitor...");
      process.exit(0);
    });
    
  } catch (error) {
    console.error("\n❌ Error initializing monitor:", error.message);
    process.exit(1);
  }
}

// Start monitoring
monitorPool().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
