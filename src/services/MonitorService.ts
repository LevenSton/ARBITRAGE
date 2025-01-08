import { ethers } from 'ethers';
import { BONDING_CONTRACT_ABI, BONDING_CONTRACT_ADDRESS, ERC20_ABI } from '../contracts/interfaces';
import { logger } from '../utils/logger';
import * as fs from "fs";

export class MonitorService {
    private httpProvider: ethers.JsonRpcProvider;
    private privateKeys: string[] = [];
    private bondingContract: ethers.Contract;
    private blockNumber: number = 0;

    constructor() {
      try {
          // 初始化 HTTP provider 作为备份
          this.httpProvider = new ethers.JsonRpcProvider(process.env.BASE_HTTP_RPC_URL!);
          this.privateKeys = JSON.parse(fs.readFileSync('./.keys.json', "utf-8"));
          // 初始化合约
          this.bondingContract = new ethers.Contract(
            BONDING_CONTRACT_ADDRESS,
            BONDING_CONTRACT_ABI,
            this.httpProvider
          );
      } catch (error) {
          logger.error('初始化 provider 失败:', error);
          throw error;
      }
  }

  private async reconnectHttpProvider() {
    try {
      this.httpProvider = new ethers.JsonRpcProvider(process.env.BASE_HTTP_RPC_URL!);
      this.bondingContract = new ethers.Contract(
        BONDING_CONTRACT_ADDRESS,
        BONDING_CONTRACT_ABI,
        this.httpProvider
      );
    } catch (error) {
      logger.error('重新连接 provider 失败:', error);
    }
  }

  async start() {

    this.blockNumber = await this.httpProvider.getBlockNumber();

    logger.info('======开始监听事件======');
    setInterval(async () => {
      try {
        const currentBlock = await this.httpProvider.getBlockNumber();
        if(currentBlock > this.blockNumber) {
          logger.info(`轮询到区块 ${currentBlock}, 当前区块 ${this.blockNumber}`);
          this.blockNumber = currentBlock;
          const LaunchedFilter = this.bondingContract.filters.Launched();
          const launchedEvents = await this.bondingContract.queryFilter(LaunchedFilter, currentBlock, currentBlock);
          for (const event of launchedEvents) {
            if (event instanceof ethers.EventLog) {
              const { args } = event;
              this.handleLaunchedEvent(args);
            }
          }
        }
      } catch(error) {
        logger.error('轮询错误:', error);
      }
    }, 1000)
  }

  private async handleLaunchedEvent(args: any) {
    try {
      const [tokenAddress, pairAddress] = args;
      logger.info(`检测到新的token发射: ${tokenAddress} -> ${pairAddress}`);
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.httpProvider);
      const name = await tokenContract.name();
      const symbol = await tokenContract.symbol();
      console.log(`token ${name}(${symbol}) 已发射`);
      const lowerSymbol = symbol.toLowerCase();
      if(lowerSymbol.startsWith('actualz')) {
        logger.info(`==========准备买入代币========== ${tokenAddress} - ${name} ${symbol}`);

        const buyPromises = this.privateKeys.map(async (privateKey) => {
          const wallet = new ethers.Wallet(privateKey, this.httpProvider);
          const contract = new ethers.Contract(BONDING_CONTRACT_ADDRESS, BONDING_CONTRACT_ABI, wallet);
          const tx = await contract.buy(ethers.parseEther('5'), tokenAddress, {
            gasLimit: 800000,
            maxFeePerGas: ethers.parseUnits("0.03", "gwei"),
            maxPriorityFeePerGas: ethers.parseUnits("0.03", "gwei")
          });
          await tx.wait();
        });
        await Promise.all(buyPromises);
        
        return;
      }
    } catch (error) {
      this.reconnectHttpProvider();
      logger.error(`买入代币时出错:`, error);
    }
  }

  async stop() {
    logger.info('======停止监听事件======');
  }
}
