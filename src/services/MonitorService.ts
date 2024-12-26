import { ethers } from 'ethers';
import { BONDING_CONTRACT_ABI, ERC20_ABI, PAIR_ABI, ROUTER_CONTRACT_ABI, ZERO_ADDRESS } from '../contracts/interfaces';
import { transactionDB, Transaction } from '../db/TransactionDB';
import { logger } from '../utils/logger';

export class MonitorService {
  private provider: ethers.providers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private targetContract: ethers.Contract;
  private routerContract: ethers.Contract;
  private id: number;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, this.provider);
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
    this.id = 0;
  }

  async start() {
    // 初始化数据库
    await transactionDB.init();
    
    logger.info('开始监听 pending 交易...');
    
    this.provider.on('pending', async (txHash) => {
      try {
        const tx = await this.provider.getTransaction(txHash);
        logger.info(`目标地址是: `, tx.to);
        if (!tx || tx.to !== process.env.BONDING_CONTRACT) return;

        const receipt = await tx.wait();
        
        for (const log of receipt.logs) {
          if (log.address === process.env.BONDING_CONTRACT) {
            const parsedLog = this.targetContract.interface.parseLog(log);
            if (parsedLog.name === 'Launched') {
              await this.handleLaunchedEvent(parsedLog.args);
            }
          }
        }
      } catch (error) {
        logger.error('处理pending交易时出错:', error);
      }
    });

    // 启动价格监控
    this.startPriceMonitoring();
  }

  private async handleLaunchedEvent(args: any) {
    const tokenAddress = args.token;
    const pairAddress = args.pair;
    logger.info(`检测到新的token发射: ${tokenAddress} -> ${pairAddress}`);

    try {
      // 执行买入操作
      const buyAmount = ethers.utils.parseEther('5'); // 设置买入金额
      const outAmount =await this.routerContract.getAmountsOut(buyAmount, process.env.VIRTUAL_TOKEN_ADDRESS);
      console.log(outAmount);
      this.id ++; 
      // const tx = await this.targetContract.buy(buyAmount, tokenAddress);
      // const receipt = await tx.wait();
      logger.info(`=====买入代币 ${tokenAddress} ======
        支付Virtual: ${ethers.utils.formatEther(buyAmount.toString())}, 
        获得Token数量: ${ethers.utils.formatEther(outAmount.toString())}
        \n ======================================
      `);

      // 记录交易到数据库
      const transaction: Transaction = {
        transactionHash: this.id.toString(),//receipt.transactionHash,
        tokenAddress,
        pairAddress,
        buyCostVirtualAmount: buyAmount.toString(),
        buyTime: new Date().toISOString(),
        purchasedToken: outAmount.toString(),
        status: 'BOUGHT'
      };

      await transactionDB.saveTransaction(transaction);

      logger.info(`成功买入代币 ${tokenAddress}`);
    } catch (error) {
      logger.error('买入代币时出错:', error);
    }
  }

  private async startPriceMonitoring() {
    logger.info('======开始价格监控======');
    setInterval(async () => {
      try {
        const boughtTransactions = await transactionDB.getAllBoughtTransactions();
        logger.info(`监控到 ${boughtTransactions.length} 条交易记录`);

        for (const tx of boughtTransactions) {
          const selledVirtualAmount = await this.routerContract.getAmountsOut(tx.purchasedToken, ZERO_ADDRESS);
          const expectSelledVirtualAmount = ethers.BigNumber.from(selledVirtualAmount);
          const buyCost = ethers.utils.parseUnits(tx.buyCostVirtualAmount, 18);
          if (expectSelledVirtualAmount.gt(buyCost.mul(2))) {
            await this.sellToken(tx, expectSelledVirtualAmount);
          }
        }
      } catch (error) {
        logger.error('监控价格时出错:', error);
      }
    }, parseInt(process.env.PRICE_CHECK_INTERVAL || '3000'));
  }

  private async sellToken(tx: Transaction, expectSelledVirtualAmount: ethers.BigNumber) {
    try {
      // const tx = await this.targetContract.buy(buyAmount, tokenAddress);
      // const receipt = await tx.wait();

      logger.info(`====卖出代币 ${tx.tokenAddress} ==== 
        获得Virtual: ${ethers.utils.formatEther(expectSelledVirtualAmount.toString())}, 
        购买付出: ${ethers.utils.formatEther(tx.buyCostVirtualAmount.toString())},
        利润为: ${ethers.utils.formatEther(expectSelledVirtualAmount.sub(ethers.utils.parseUnits(tx.buyCostVirtualAmount, 18)).toString())}
        \n ======================================
      `);
      // 更新交易记录
      const updates: Partial<Transaction> = {
        sellTime: new Date().toISOString(),
        soldVirtualAmount: expectSelledVirtualAmount.toString(),
        profit: expectSelledVirtualAmount.sub(ethers.utils.parseUnits(tx.buyCostVirtualAmount, 18)).toString(),
        status: 'SOLD'
      };

      await transactionDB.updateTransaction(tx.transactionHash, updates);

      logger.info(`成功卖出代币 ${tx.tokenAddress}`);
    } catch (error) {
      logger.error('卖出代币时出错:', error);
    }
  }

  async stop() {
    // 关闭数据库连接
    await transactionDB.close();
  }
}
