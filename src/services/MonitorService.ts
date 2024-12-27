import { ethers } from 'ethers';
import { BONDING_CONTRACT_ABI, ROUTER_CONTRACT_ABI, VIRTUAL_TOKEN_ADDRESS, ZERO_ADDRESS } from '../contracts/interfaces';
import { transactionDB, Transaction } from '../db/TransactionDB';
import { logger } from '../utils/logger';

export class MonitorService {
  private httpProvider: ethers.JsonRpcProvider | null;
  private wallet: ethers.Wallet | null;
  private targetContract: ethers.Contract | null;
  private routerContract: ethers.Contract | null;
  private wsContract: ethers.Contract | null;
  private id: number = 0;
  private isListening = false;
  private retryCount = 0;
  private maxRetries = 5;
  private retryDelay = 5000;
  private lastestBlockNumber = 0;

  constructor() {
    this.httpProvider = null;
    this.wallet = null;
    this.targetContract = null;
    this.routerContract = null;
    this.wsContract = null;
  }

  async initialize() {
    try {
        this.httpProvider = new ethers.JsonRpcProvider(process.env.BASE_HTTP_RPC_URL!);
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, this.httpProvider);
        this.targetContract = new ethers.Contract(
          process.env.BONDING_CONTRACT!,
          BONDING_CONTRACT_ABI,
          this.wallet
        );
        this.routerContract = new ethers.Contract(
          process.env.ROUTER_CONTRACT!,
          ROUTER_CONTRACT_ABI,
          this.wallet
        );
        this.retryCount = 0;
        this.lastestBlockNumber = await this.httpProvider.getBlockNumber();
        return true;
    } catch (error) {
        logger.error('初始化失败:', error);
        return false;
    }
}

  async start() {
    logger.info('开始监听 Launched 事件...');
    if (!this.targetContract) {
      const initialized = await this.initialize();
      if (!initialized) return;
    }
    this.isListening = true;

    try {
      // 监听 Launched 事件
      this.wsContract!.on('Launched', async (token: string, pair: string, amount: ethers.BigNumberish) => {
        try {
          await this.handleLaunchedEvent({ token, pair, amount });
        } catch (error) {
          logger.error('处理 Launched 事件时出错:', error);
        }
      });
    } catch (error) {
      logger.error('监听 Launched 事件时出错:', error);
      await this.handleDisconnection();
    }

    // 启动价格监控
    this.startPriceMonitoring();
  }

  async handleDisconnection() {
    if (!this.isListening) return;

    if (this.retryCount >= this.maxRetries) {
        logger.error('达到最大重试次数。请检查您的连接。');
        this.isListening = false;
        return;
    }

    logger.info(`尝试重新连接... (第 ${this.retryCount + 1}/${this.maxRetries} 次)`);
    
    try {
      // 延迟重试
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      // 重新初始化连接
      const initialized = await this.initialize();
      if (initialized) {
        this.retryCount++;
        await this.start();
      } else {
        await this.handleDisconnection();
      }
    } catch (error) {
      this.retryCount++;
      logger.error('重新连接时出错:', error);
      // 递归重试
      await this.handleDisconnection();
    }
}

  private async handleLaunchedEvent(args: any) {
    const tokenAddress = args.token;
    const pairAddress = args.pair;
    logger.info(`检测到新的token发射: ${tokenAddress} -> ${pairAddress}`);

    try {
      // 执行买入操作
      const buyAmount = ethers.parseEther('5'); // 设置买入金额
      const outAmount = await this.routerContract!.getAmountsOut(tokenAddress, VIRTUAL_TOKEN_ADDRESS, buyAmount);
      this.id ++; 
      // const tx = await this.targetContract.buy(buyAmount, tokenAddress);
      // const receipt = await tx.wait();
      logger.info(`买入代币 ${tokenAddress} 支付Virtual: ${ethers.formatEther(buyAmount.toString())}, 获得Token: ${ethers.formatEther(outAmount.toString())}`);

      // 记录交易到数据库
      const transaction: Transaction = {
        transactionHash: this.id.toString(),
        tokenAddress,
        pairAddress,
        buyCostVirtualAmount: buyAmount.toString(),
        purchasedToken: outAmount.toString(),
        buyTime: new Date().toISOString(),
        status: 'BOUGHT'
      };
      await transactionDB.saveTransaction(transaction);
    } catch (error) {
      logger.error(`买入代币 ${tokenAddress} 时出错:`, error);
    }
  }

  private async startPriceMonitoring() {
    logger.info('======开始价格监控======');
    setInterval(async () => {
      try {
        const boughtTransactions = await transactionDB.getAllBoughtTransactions();

        for (const tx of boughtTransactions) {
          const selledVirtualAmount = await this.routerContract!.getAmountsOut(tx.tokenAddress, ZERO_ADDRESS, tx.purchasedToken);
          const buyAmount = BigInt(tx.buyCostVirtualAmount);

          if (selledVirtualAmount > (buyAmount * BigInt(15) / BigInt(10))) {
            await this.sellToken(tx, selledVirtualAmount);
          }
        }
      } catch (error) {
        logger.error('监控价格时出错:', error);
      }
    }, parseInt(process.env.PRICE_CHECK_INTERVAL || '3000'));
  }

  private async sellToken(tx: Transaction, expectSelledVirtualAmount: ethers.BigNumberish) {
    try {
      // const tx = await this.targetContract.buy(buyAmount, tokenAddress);
      // const receipt = await tx.wait();

      logger.info(`卖出代币 ${tx.tokenAddress} 获得Virtual: ${ethers.formatEther(expectSelledVirtualAmount)}, 利润为: ${ethers.formatEther(`${BigInt(expectSelledVirtualAmount) - BigInt(tx.buyCostVirtualAmount)}`)}`);

      // 更新交易记录
      const updates: Partial<Transaction> = {
        sellTime: new Date().toISOString(),
        soldVirtualAmount: expectSelledVirtualAmount.toString(),
        profit: (BigInt(expectSelledVirtualAmount) - BigInt(tx.buyCostVirtualAmount)).toString(),
        status: 'SOLD'
      };

      await transactionDB.updateTransaction(tx.transactionHash, updates);
      logger.info(`成功卖出代币 ${tx.tokenAddress}`);
    } catch (error) {
      logger.error(`卖出代币 ${tx.tokenAddress} 时出错:`, error);
    }
  }

  async stop() {
    this.isListening = false;
    logger.info('已停止监听事件');
  }
}
