export const BONDING_CONTRACT_ABI = [
  "event Launched(address indexed token, address indexed pair, uint)",
  "function buy(uint256 amountIn, address tokenAddress) public payable returns (bool)"
];

export const ROUTER_CONTRACT_ABI = [
  "function getAmountsOut(address token, address assetToken_, uint256 amountIn) public view returns (uint256 _amountOut)"
];
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';