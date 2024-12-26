export const BONDING_CONTRACT_ABI = [
  "event Launched(address indexed token, address indexed pair, uint)",
  "function buy(uint256 amountIn, address tokenAddress) public payable returns (bool)"
];

export const ROUTER_CONTRACT_ABI = [
  "function getAmountsOut(address token, address assetToken_, uint256 amountIn) public view returns (uint256 _amountOut)"
];

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

export const PAIR_ABI = [
  "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';