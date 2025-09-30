import { toChecksumAddress } from "src/utils/checksumAddress";
import { shadowConfig } from "./shadowConfig";

export const SUPPORTED_TOKENS = [
  'BTC',
  'ETH',
  'SONIC',
]

export const UNIVERSAL_ROUTER_ADDRESS = toChecksumAddress(shadowConfig.universalRouterAddress);

export const TOKEN_ADDRESSES = {
  'USDC': toChecksumAddress(shadowConfig.usdcAddress),
  'BTC': toChecksumAddress(shadowConfig.btcAddress),
  'ETH': toChecksumAddress(shadowConfig.ethAddress),
  'SONIC': toChecksumAddress(shadowConfig.sonicAddress),
}

export const getTokenBySymbol = (symbol: string) => {
  // Map trading symbols to their wrapped token symbols
  const symbolMapping: Record<string, string> = {
    'SONIC': 'WSONIC',
    'BTC': 'WBTC',
    'ETH': 'WETH',
    'USDC': 'USDC'
  };

  const wrappedSymbol = symbolMapping[symbol];
  if (!wrappedSymbol) {
    throw new Error(`Token ${symbol} not found in mapping`);
  }

  const token = WHITELISTED_TOKENS.find((token) => token.symbol === wrappedSymbol);
  if (!token) {
    throw new Error(`Token ${wrappedSymbol} not found in WHITELISTED_TOKENS`);
  }

  return token;
}


export const WHITELISTED_TOKENS = [
  {
    address: toChecksumAddress(shadowConfig.sonicAddress),
    symbol: "WSONIC",
    decimals: 18,
  },
  {
    address: toChecksumAddress(shadowConfig.btcAddress),
    symbol: "WBTC",
    decimals: 8,
  },
  {
    address: toChecksumAddress(shadowConfig.ethAddress),
    symbol: "WETH",
    decimals: 18,
  },
  {
    address: toChecksumAddress(shadowConfig.usdcAddress),
    symbol: "USDC",
    decimals: 6,
  },
];