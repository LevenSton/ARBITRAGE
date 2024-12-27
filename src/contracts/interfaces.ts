export const BONDING_CONTRACT_ABI = [
  "event Launched(address indexed token, address indexed pair, uint)",
  "function buy(uint256 amountIn, address tokenAddress) public payable returns (bool)"
];

export const ROUTER_CONTRACT_ABI = [
  "function getAmountsOut(address token, address assetToken_, uint256 amountIn) public view returns (uint256 _amountOut)"
];
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const VIRTUAL_TOKEN_ADDRESS = '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b';
export const BONDING_CONTRACT_ADDRESS = '0xF66DeA7b3e897cD44A5a231c61B6B4423d613259'
export const ROUTER_CONTRACT_ADDRESS = '0x8292B43aB73EfAC11FAF357419C38ACF448202C5'