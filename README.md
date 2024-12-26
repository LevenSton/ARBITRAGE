# Base 链交易监听与自动交易系统

这是一个在 Base 区块链上监听特定合约事件并自动执行交易的系统。

## 功能特点

1. 监听 Base 区块链的 pending 交易
2. 检测特定合约的 Launched 事件
3. 自动执行买入交易
4. 使用 LevelDB 本地存储交易记录
5. 自动监控代币价格并在达到目标价格时卖出

## 技术架构

- 编程语言：TypeScript
- 区块链交互：ethers.js
- 数据存储：LevelDB
- 配置管理：dotenv

## 项目结构

```
├── src/
│   ├── config/          # 配置文件
│   ├── contracts/       # 合约 ABI 定义
│   ├── db/             # 数据库操作
│   ├── services/       # 业务逻辑
│   └── utils/          # 工具函数
├── data/               # LevelDB 数据存储目录
├── package.json
├── tsconfig.json
└── .env
```

## 环境要求

- Node.js >= 16
- Base 链 RPC 节点访问

## 安装与配置

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量：
创建 .env 文件并设置以下变量：
```
BASE_RPC_URL=你的Base链RPC地址
PRIVATE_KEY=你的钱包私钥
```

## 使用说明

1. 启动监听服务：
```bash
npm run start
```

2. 查看交易记录：
所有交易记录都会保存在项目的 `data` 目录下的 LevelDB 数据库中。

## 数据结构

交易记录包含以下字段：
- transactionHash: 交易哈希
- tokenAddress: 代币合约地址
- pairAddress: 交易对合约地址
- buyAmount: 买入数量
- buyTime: 买入时间
- buyTokenCost: 消耗的代币数量
- sellTime: 卖出时间
- sellAmount: 卖出数量
- sellProceeds: 卖出所得
- profit: 利润

## 注意事项

1. 请确保有足够的 ETH 支付 gas 费用
2. 建议在使用前先小额测试
3. 请妥善保管私钥，不要泄露给他人

## 更新日志

### v1.0.0 (2024-12-26)
- 初始版本发布
- 实现基本的监听和交易功能
- 使用 LevelDB 进行本地数据存储
