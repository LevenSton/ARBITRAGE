import { ethers } from 'ethers';
import { BONDING_CONTRACT_ABI, BONDING_CONTRACT_ADDRESS, ROUTER_CONTRACT_ABI, ROUTER_CONTRACT_ADDRESS, VIRTUAL_TOKEN_ADDRESS, ZERO_ADDRESS } from '../contracts/interfaces';
import { transactionDB, Transaction } from '../db/TransactionDB';
import { logger } from '../utils/logger';

export class MonitorService {
    private httpProvider: ethers.JsonRpcProvider;
    private wsProviders: ethers.WebSocketProvider[] = [];
    private id: number = 0;
    private wallet: ethers.Wallet;
    private bondingContract: ethers.Contract;
    private routerContract: ethers.Contract;
    private isListening = false;
    private eventCache = new Set<string>(); // 用于事件去重

    constructor(
        private readonly config: {
          // 多个 WebSocket 节点，用于负载均衡
          wsUrls: string[],
          // 备用 HTTP 节点
          httpUrl: string,
          // 可选配置
          options?: {
              maxCacheSize?: number,
              reconnectInterval?: number
          }
      }
    ) {
      try {
          // 初始化多个 WebSocket provider
          this.wsProviders = this.config.wsUrls.map(url => 
              new ethers.WebSocketProvider(url)
          );
          
          // 初始化 HTTP provider 作为备份
          this.httpProvider = new ethers.JsonRpcProvider(this.config.httpUrl);
          this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
          // 初始化合约
          this.bondingContract = new ethers.Contract(
            BONDING_CONTRACT_ADDRESS,
            BONDING_CONTRACT_ABI,
            this.wallet.connect(this.httpProvider)
          );
          this.routerContract = new ethers.Contract(
            ROUTER_CONTRACT_ADDRESS,
            ROUTER_CONTRACT_ABI,
            this.wallet.connect(this.httpProvider)
          );
          // 设置 provider 健康检查
          this.setupHealthCheck();
      } catch (error) {
          logger.error('初始化 provider 失败:', error);
          throw error;
      }
  }

  private async checkProviderHealth(provider: ethers.Provider): Promise<boolean> {
      try {
          // 尝试获取最新区块号来检查连接状态
          await provider.getBlockNumber();
          return true;
      } catch (error) {
          return false;
      }
  }

  private setupHealthCheck() {
      // 定期检查 WebSocket 连接健康状况
      setInterval(async () => {
        for (let i = 0; i < this.wsProviders.length; i++) {
            const isHealthy = await this.checkProviderHealth(this.wsProviders[i]);
            if (!isHealthy) {
                logger.info(`WebSocket ${i} 可能断开，尝试重连...`);
                await this.reconnectWebSocket(i);
            }
        }
    }, this.config.options?.reconnectInterval || 5000);
  }

  private async reconnectWebSocket(index: number) {
    try {
        // 关闭旧的 provider
        const oldProvider = this.wsProviders[index];
        oldProvider.removeAllListeners();

        const newProvider = new ethers.WebSocketProvider(
            this.config.wsUrls[index]
        );
        this.wsProviders[index] = newProvider;
        
        // 重新设置事件监听
        if (this.isListening) {
            await this.setupEventListener(newProvider);
        }
    } catch (error) {
      logger.error(`重连 WebSocket ${index} 失败:`, error);
    }
  }

  private async reconnectHttpProvider() {
    const blockNum = await this.httpProvider.getBlockNumber();
    logger.info("blockNum: ", blockNum)
    this.httpProvider = new ethers.JsonRpcProvider(this.config.httpUrl);
    this.bondingContract = new ethers.Contract(
      BONDING_CONTRACT_ADDRESS,
      BONDING_CONTRACT_ABI,
      this.wallet.connect(this.httpProvider)
    );
    this.routerContract = new ethers.Contract(
      ROUTER_CONTRACT_ADDRESS,
      ROUTER_CONTRACT_ABI,
      this.wallet.connect(this.httpProvider)
    );
  }

  private async setupEventListener(provider: ethers.Provider) {
    const contract = new ethers.Contract(
      BONDING_CONTRACT_ADDRESS,
      BONDING_CONTRACT_ABI,
      provider
    );

    // 监听具体事件
    contract.on('Launched', async (...args) => {
        try {
            const event = args[args.length - 1];
            if (this.eventCache.has(event.transactionHash)) return;
            this.eventCache.add(event.transactionHash);

            await this.handleLaunchedEvent(args);
        } catch (error) {
            logger.error('处理事件失败:', error);
        }
    });
  }

  async start() {
    if (this.isListening) return;
    this.isListening = true;

    try {
        // 在所有 provider 上设置监听
        await Promise.all(
            this.wsProviders.map(provider => 
                this.setupEventListener(provider)
            )
        );

        this.startPriceMonitoring();

        // 清理过期缓存
        setInterval(() => {
            if (this.eventCache.size > (this.config.options?.maxCacheSize || 1000)) {
                this.eventCache.clear();
            }
        }, 60000);

        logger.info('监听器已启动');
    } catch (error) {
        logger.error('启动监听器失败:', error);
        this.isListening = false;
        throw error;
    }
  }

  private async handleLaunchedEvent(args: any) {
    const tokenAddress = args[0];
    const pairAddress = args[1];
    logger.info(`检测到新的token发射: ${tokenAddress} -> ${pairAddress}`);

    try {
      // 执行买入操作
      const buyAmount = ethers.parseEther('5'); // 设置买入金额
      const outAmount = await this.routerContract!.getAmountsOut(tokenAddress, VIRTUAL_TOKEN_ADDRESS, buyAmount);
      this.id ++; 
      // const tx = await this.bondingContract.buy(buyAmount, tokenAddress);
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
      this.reconnectHttpProvider();
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
        this.reconnectHttpProvider();
      }
    }, parseInt(process.env.PRICE_CHECK_INTERVAL || '3000'));
  }

  private async sellToken(tx: Transaction, expectSelledVirtualAmount: ethers.BigNumberish) {
    try {
      // const tx = await this.bondingContract.buy(buyAmount, tokenAddress);
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
      this.reconnectHttpProvider();
      logger.error(`卖出代币 ${tx.tokenAddress} 时出错:`, error);
    }
  }

  async stop() {
    this.isListening = false;
    this.wsProviders.forEach(provider => {
        provider.removeAllListeners();
        (provider as any)._websocket?.close();
    });
    this.eventCache.clear();
    logger.info('监听器已停止');
  }
}
