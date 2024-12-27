import { ethers } from 'ethers';
import { BONDING_CONTRACT_ABI, BONDING_CONTRACT_ADDRESS, ERC20_ABI, ROUTER_CONTRACT_ABI, ROUTER_CONTRACT_ADDRESS, VIRTUAL_TOKEN_ADDRESS, ZERO_ADDRESS } from '../contracts/interfaces';
import { transactionDB, Transaction } from '../db/TransactionDB';
import { logger } from '../utils/logger';

export class MonitorService {
    private httpProvider: ethers.JsonRpcProvider;
    private id: number = 0;
    private wallet: ethers.Wallet;
    private bondingContract: ethers.Contract;
    private routerContract: ethers.Contract;
    private blockNumber: number = 0;

    constructor() {
      try {
          // 初始化 HTTP provider 作为备份
          this.httpProvider = new ethers.JsonRpcProvider(process.env.BASE_HTTP_RPC_URL!);
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
      } catch (error) {
          logger.error('初始化 provider 失败:', error);
          throw error;
      }
  }

  private async reconnectHttpProvider() {
    try {
      this.httpProvider = new ethers.JsonRpcProvider(process.env.BASE_HTTP_RPC_URL!);
      this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
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
    } catch (error) {
      logger.error('重新连接 provider 失败:', error);
    }
  }

  async start() {
    this.startPriceMonitoring();

    logger.info('======开始监听事件======');
    setInterval(async () => {
      try {
        const currentBlock = await this.httpProvider.getBlockNumber();
        if(currentBlock > this.blockNumber) {
          this.blockNumber = currentBlock;
          const LaunchedFilter = this.bondingContract.filters.Launched();
          const launchedEvents = await this.routerContract.queryFilter(LaunchedFilter, currentBlock, currentBlock);
          for (const event of launchedEvents) {
            if (event instanceof ethers.EventLog) {
              this.handleLaunchedEvent(event);
            }
          }
        }
      } catch(error) {
        console.error('轮询错误:', error);
      }
    }, 2000)
  }

  private async handleLaunchedEvent(args: any) {
    const [tokenAddress, pairAddress] = args;
    logger.info(`检测到新的token发射: ${tokenAddress} -> ${pairAddress}`);
    try {
      // 执行买入操作
      //const outAmount = await this.routerContract!.getAmountsOut(tokenAddress, VIRTUAL_TOKEN_ADDRESS, buyAmount);
      this.id ++; 
      const tx = await this.bondingContract.buy(ethers.parseEther('5'), tokenAddress);
      const receipt = await tx.wait();
      if(receipt.status === 1) {
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.httpProvider);
        const balance = await tokenContract.balanceOf(this.wallet.address);
        logger.info(`买入代币 ${tokenAddress} 支付Virtual: ${ethers.formatEther(ethers.parseEther('5').toString())}, 获得Token: ${ethers.formatEther(balance.toString())}`);
        // 记录交易到数据库
        const transaction: Transaction = {
          transactionHash: this.id.toString(),
          tokenAddress,
          pairAddress,
          buyCostVirtualAmount: ethers.parseEther('5').toString(),
          purchasedToken: balance.toString(),
          buyTime: new Date().toISOString(),
          status: 'BOUGHT'
        };
        await transactionDB.saveTransaction(transaction);
      }
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
      const res = await this.bondingContract.sell(tx.purchasedToken, tx.tokenAddress);
      const receipt = await res.wait();
      if(receipt.status === 1) {
        logger.info(`卖出代币 ${tx.tokenAddress} 预期获得Virtual: ${ethers.formatEther(expectSelledVirtualAmount)}, 预期利润为: ${ethers.formatEther(`${BigInt(expectSelledVirtualAmount) - BigInt(tx.buyCostVirtualAmount)}`)}`);
        // 更新交易记录
        const updates: Partial<Transaction> = {
          sellTime: new Date().toISOString(),
          soldVirtualAmount: expectSelledVirtualAmount.toString(),
          profit: (BigInt(expectSelledVirtualAmount) - BigInt(tx.buyCostVirtualAmount)).toString(),
          status: 'SOLD'
        };
        await transactionDB.updateTransaction(tx.transactionHash, updates);
        logger.info(`成功卖出代币 ${tx.tokenAddress}`);
      }
    } catch (error) {
      this.reconnectHttpProvider();
      logger.error(`卖出代币 ${tx.tokenAddress} 时出错:`, error);
    }
  }

  async stop() {
    logger.info('======停止监听事件======');
  }
}
