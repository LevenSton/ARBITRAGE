import { ethers } from 'ethers';
import { transactionDB, Transaction } from '../db/TransactionDB';
import { logger } from './logger';

interface TokenProfit {
  tokenAddress: string;
  totalBuyAmount: string;
  totalSellAmount: string;
  profit: string;
  transactions: number;
}

interface HoldingRecord {
  tokenAddress: string;
  buyAmount: string;
  buyTime: string;
  transactionHash: string;
}

interface StatisticsResult {
  soldTokens: {
    tokenProfits: TokenProfit[];
    totalProfit: string;
  };
  holdingTokens: {
    records: HoldingRecord[];
    totalInvestment: string;
  };
}

/**
 * 获取所有交易统计信息
 * @returns 包含已卖出和持有中代币的统计信息
 */
export async function getTradeStatistics(): Promise<StatisticsResult> {
  try {
    // 获取所有交易记录
    const allTransactions = await getAllTransactions();
    
    // 分离已卖出和持有中的交易
    const soldTransactions = allTransactions.filter(tx => tx.status === 'SOLD');
    const holdingTransactions = allTransactions.filter(tx => tx.status === 'BOUGHT');

    // 计算已卖出代币的利润
    const tokenProfits = calculateTokenProfits(soldTransactions);
    const totalProfit = calculateTotalProfit(tokenProfits);

    // 统计持有中的代币
    const holdingRecords = formatHoldingRecords(holdingTransactions);
    const totalInvestment = calculateTotalInvestment(holdingTransactions);

    return {
      soldTokens: {
        tokenProfits,
        totalProfit
      },
      holdingTokens: {
        records: holdingRecords,
        totalInvestment
      }
    };
  } catch (error) {
    logger.error('获取交易统计信息时出错:', error);
    throw error;
  }
}

/**
 * 获取所有已卖出代币的利润统计
 * @returns 每个代币的利润统计和总利润
 */
export async function getSoldTokensProfits(): Promise<{
  tokenProfits: TokenProfit[];
  totalProfit: string;
}> {
  try {
    const allTransactions = await getAllTransactions();
    const soldTransactions = allTransactions.filter(tx => tx.status === 'SOLD');
    
    const tokenProfits = calculateTokenProfits(soldTransactions);
    const totalProfit = calculateTotalProfit(tokenProfits);

    return {
      tokenProfits,
      totalProfit
    };
  } catch (error) {
    console.error('获取已卖出代币利润统计时出错:', error);
    throw error;
  }
}

/**
 * 获取所有持有中代币的统计
 * @returns 持有中的代币记录和总投资额
 */
export async function getHoldingTokensStatistics(): Promise<{
  records: HoldingRecord[];
  totalInvestment: string;
}> {
  try {
    const allTransactions = await getAllTransactions();
    const holdingTransactions = allTransactions.filter(tx => tx.status === 'BOUGHT');
    
    const records = formatHoldingRecords(holdingTransactions);
    const totalInvestment = calculateTotalInvestment(holdingTransactions);

    return {
      records,
      totalInvestment
    };
  } catch (error) {
    console.error('获取持有中代币统计时出错:', error);
    throw error;
  }
}

// 辅助函数

async function getAllTransactions(): Promise<Transaction[]> {
  return await transactionDB.getAllTransactions();
}

function calculateTokenProfits(soldTransactions: Transaction[]): TokenProfit[] {
  const profitsByToken = new Map<string, TokenProfit>();

  for (const tx of soldTransactions) {
    const tokenProfit = profitsByToken.get(tx.tokenAddress) || {
      tokenAddress: tx.tokenAddress,
      totalBuyAmount: '0',
      totalSellAmount: '0',
      profit: '0',
      transactions: 0
    };

    // 转换为 BigNumber 进行计算
    const profit = tx.profit
      ? BigInt(tx.profit)
      : BigInt(0);

    tokenProfit.totalBuyAmount = BigInt(tokenProfit.totalBuyAmount)
       + (BigInt(tx.buyCostVirtualAmount))
      .toString();
    tokenProfit.totalSellAmount = BigInt(tokenProfit.totalSellAmount)
      + (BigInt(tx.soldVirtualAmount!))
      .toString();
    tokenProfit.profit = BigInt(tokenProfit.profit)
      + (profit)
      .toString();
    tokenProfit.transactions += 1;

    profitsByToken.set(tx.tokenAddress, tokenProfit);
  }

  return Array.from(profitsByToken.values());
}

function calculateTotalProfit(tokenProfits: TokenProfit[]): string {
  return tokenProfits.reduce(
    (total, token) => total + BigInt(token.profit),
    BigInt(0)
  ).toString();
}

function formatHoldingRecords(holdingTransactions: Transaction[]): HoldingRecord[] {
  return holdingTransactions.map(tx => ({
    tokenAddress: tx.tokenAddress,
    buyAmount: tx.buyCostVirtualAmount,
    buyTime: tx.buyTime,
    transactionHash: tx.transactionHash
  }));
}

function calculateTotalInvestment(holdingTransactions: Transaction[]): string {
  return holdingTransactions.reduce(
    (total, tx) => total + BigInt(tx.buyCostVirtualAmount),
    BigInt(0)
  ).toString();
}

// 格式化工具函数
export function formatEther(value: string): string {
  return ethers.formatEther(value);
}

export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai'
  });
}

async function main() {
  try {
    // 确保数据库已初始化
    await transactionDB.init();
    
    const txs = await getAllTransactions();
    console.log('所有交易记录:', { transactions: txs });
  } catch (error) {
    console.error('获取交易记录时出错:', error);
    process.exit(1);
  } finally {
    // 确保在程序结束时关闭数据库连接
    await transactionDB.close();
  }
}

main().catch(error => {
  console.error('执行统计程序时出错:', error);
  process.exit(1);
});