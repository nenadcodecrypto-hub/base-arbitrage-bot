import { ethers } from "ethers";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║   DUAL DEX PRICE MONITOR: Uniswap V3 + Aerodrome Slipstream (Base)          ║
 * ║   Monitors cbBTC/USDC pair on both DEXes and calculates spreads             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * This script monitors the cbBTC/USDC price on two DEXes on Base:
 * 1. Uniswap V3 Pool: 0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef
 * 2. Aerodrome Slipstream Pool: 0x4e962bb3889bf030368f56810a9c96b83cb3e778
 * 
 * Features:
 * - Real-time price monitoring via Swap events on both DEXes
 * - Automatic token ordering detection (handles token0/token1 variations)
 * - High-precision BigInt calculations for accurate pricing
 * - Spread calculation showing arbitrage opportunities
 * - Formatted logging with timestamps and transaction hashes
 * 
 * Aerodrome Slipstream uses a Uniswap V3-compatible interface with:
 * - slot0() function returning sqrtPriceX96
 * - token0() and token1() for token addresses
 * - Swap event with identical signature to Uniswap V3
 */

// ===== CONFIGURATION =====
// Base mainnet RPC URL from environment variable
const BASE_RPC = process.env.BASE_RPC_URL || "https://base-mainnet.publicnode.com";

// Uniswap V3 cbBTC/USDC pool address on Base
const UNISWAP_POOL_ADDRESS = "0xfbb6eed8e7aa03b138556eedaf5d271a5e1e43ef";

// Aerodrome Slipstream cbBTC/USDC pool address on Base
const AERODROME_POOL_ADDRESS = "0x4e962bb3889bf030368f56810a9c96b83cb3e778";

// Token decimals
const cbBTC_DECIMALS = 8;  // cbBTC decimals (like BTC)
const USDC_DECIMALS = 6;   // USDC decimals

// Token addresses
const cbBTC_ADDRESS = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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
    
    // Calculate price with decimal adjustment: (sqrtPriceX96^2 * 10^6) / (2^192 * 10^18)
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(USDC_DECIMALS));
    const denominator = Q96 * Q96 * (10n ** BigInt(cbBTC_DECIMALS));
    
    // Convert to number (this gives cbBTC per USDC)
    const cbBTCperUSDC = Number(numerator) / Number(denominator);
    
    // Invert to get USDC per cbBTC
    return 1 / cbBTCperUSDC;
  } else {
    // cbBTC is token0, USDC is token1
    // price = token1/token0 = USDC/cbBTC (in raw units)
    
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(USDC_DECIMALS));
    const denominator = Q96 * Q96 * (10n ** BigInt(cbBTC_DECIMALS));
    
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
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(USDC_DECIMALS));
    const denominator = Q96 * Q96 * (10n ** BigInt(cbBTC_DECIMALS));
    const cbBTCperUSDC = Number(numerator) / Number(denominator);
    return 1 / cbBTCperUSDC;
  } else {
    // cbBTC is token0, USDC is token1
    const numerator = sqrtPriceX96BigInt * sqrtPriceX96BigInt * (10n ** BigInt(USDC_DECIMALS));
    const denominator = Q96 * Q96 * (10n ** BigInt(cbBTC_DECIMALS));
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

// ===== MAIN MONITORING LOGIC =====
async function monitorPool() {
  console.log("🚀 Starting Dual DEX cbBTC/USDC Price Monitor on Base");
  console.log("   📊 Uniswap V3 + Aerodrome Slipstream\n");
  
  // Connect to Base mainnet
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  console.log(`📡 Connected to Base RPC: ${BASE_RPC}\n`);
  
  // ===== UNISWAP V3 INITIALIZATION =====
  console.log("=" .repeat(80));
  console.log("🦄 UNISWAP V3 INITIALIZATION");
  console.log("=".repeat(80));
  console.log(`📍 Pool Address: ${UNISWAP_POOL_ADDRESS}\n`);
  
  // Create Uniswap pool contract instance
  const uniswapPool = new ethers.Contract(UNISWAP_POOL_ADDRESS, UNISWAP_POOL_ABI, provider);
  
  // Variables to track prices
  let lastUniswapPrice = 0;
  let lastAerodromePrice = 0;
  let uniswapIsInverted = false;
  let aerodromeIsInverted = false;
  
  try {
    // ===== UNISWAP V3 SETUP =====
    // Detect token ordering
    console.log("🔍 Detecting token ordering...");
    const uniToken0 = await uniswapPool.token0();
    const uniToken1 = await uniswapPool.token1();
    
    // Check if cbBTC is token0 or token1
    uniswapIsInverted = uniToken0.toLowerCase() === USDC_ADDRESS.toLowerCase();
    
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
    console.log(`📍 Pool Address: ${AERODROME_POOL_ADDRESS}\n`);
    
    // Create Aerodrome pool contract instance
    // Using the full ABI from Basescan - Slipstream is Uniswap V3 compatible
    const aerodromePool = new ethers.Contract(AERODROME_POOL_ADDRESS, AERODROME_POOL_ABI, provider);
    
    // Detect Aerodrome token ordering
    console.log("🔍 Detecting token ordering...");
    const aeroToken0 = await aerodromePool.token0();
    const aeroToken1 = await aerodromePool.token1();
    
    aerodromeIsInverted = aeroToken0.toLowerCase() === USDC_ADDRESS.toLowerCase();
    
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
    
    console.log(`💰 Initial Aerodrome Slipstream Price: 1 cbBTC = ${formatPrice(lastAerodromePrice)} USDC`);
    
    // Calculate initial spread
    const initialSpread = calculateSpread(lastAerodromePrice, lastUniswapPrice);
    console.log(`📊 Initial Spread (Aerodrome vs Uniswap): ${formatSpread(initialSpread)}\n`);
    
    console.log("=".repeat(80));
    console.log("👀 MONITORING STARTED - Listening for price changes...");
    console.log("=".repeat(80));
    console.log();
    
    // ===== UNISWAP V3 EVENT LISTENER =====
    uniswapPool.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
      try {
        // Re-read slot0 to get the latest price
        const slot0 = await uniswapPool.slot0();
        const newPrice = calculatePrice(slot0.sqrtPriceX96, uniswapIsInverted);
        
        // Only log if price changed significantly
        if (Math.abs(newPrice - lastUniswapPrice) > 0.01) {
          const priceChange = ((newPrice - lastUniswapPrice) / lastUniswapPrice) * 100;
          const changeSymbol = priceChange >= 0 ? "📈" : "📉";
          const spread = calculateSpread(lastAerodromePrice, newPrice);
          
          console.log(`[${new Date().toLocaleTimeString()}] ${changeSymbol} UNISWAP V3 Price Update`);
          console.log(`   Price: 1 cbBTC = ${formatPrice(newPrice)} USDC`);
          console.log(`   Change: ${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(3)}%`);
          console.log(`   Spread vs Aerodrome: ${formatSpread(spread)}`);
          console.log(`   Tx: ${event.log.transactionHash}`);
          console.log("─".repeat(80));
          
          lastUniswapPrice = newPrice;
        }
      } catch (error) {
        console.error("❌ Error processing Uniswap swap event:", error.message);
      }
    });
    
    // ===== AERODROME SLIPSTREAM EVENT LISTENER =====
    // Swap event has the same signature as Uniswap V3 (confirmed from ABI):
    // event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
    aerodromePool.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96, liquidity, tick, event) => {
      try {
        // Re-read the price state using slot0() (same as Uniswap V3)
        const slot0 = await aerodromePool.slot0();
        // Extract sqrtPriceX96 from the slot0 return structure
        const newPrice = calculateAerodromePrice(slot0.sqrtPriceX96, aerodromeIsInverted);
        
        // Only log if price changed significantly
        if (Math.abs(newPrice - lastAerodromePrice) > 0.01) {
          const priceChange = ((newPrice - lastAerodromePrice) / lastAerodromePrice) * 100;
          const changeSymbol = priceChange >= 0 ? "📈" : "📉";
          const spread = calculateSpread(newPrice, lastUniswapPrice);
          
          console.log(`[${new Date().toLocaleTimeString()}] ${changeSymbol} AERODROME SLIPSTREAM Price Update`);
          console.log(`   Price: 1 cbBTC = ${formatPrice(newPrice)} USDC`);
          console.log(`   Change: ${priceChange >= 0 ? "+" : ""}${priceChange.toFixed(3)}%`);
          console.log(`   Spread vs Uniswap: ${formatSpread(spread)}`);
          console.log(`   Tx: ${event.log.transactionHash}`);
          console.log("─".repeat(80));
          
          lastAerodromePrice = newPrice;
        }
      } catch (error) {
        console.error("❌ Error processing Aerodrome swap event:", error.message);
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
